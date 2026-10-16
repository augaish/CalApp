#!/usr/bin/env bash
# Runs inside the emulator job: installs the test app, lets it pick up the
# latest preview update, then opens each screen in screens.txt with sample
# data, in English and Arabic, and saves a screenshot of each.
set -uo pipefail
APK=$1
OUT=$2
HERE=$(cd "$(dirname "$0")" && pwd)
PKG=com.augaish.calapp
DB=/data/data/$PKG/databases/RKStorage
mkdir -p "$OUT"

adb install -r -g "$APK"
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS || true

adb root >/dev/null; sleep 3
# The emulator's own launcher can freeze ("isn't responding") and its box
# covers the app: switch it off, and hide such boxes.
adb shell settings put global hide_error_dialogs 1 || true
adb shell pm disable-user --user 0 com.google.android.apps.nexuslauncher >/dev/null 2>&1 || true
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1 || true

# Cold starts until the preview update has been downloaded (expo-updates
# keeps it under files/.expo-internal), then one more so it is the one running.
for i in 1 2 3 4 5; do
  adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null
  sleep 40
  adb exec-out screencap -p > "$OUT/00-launch-$i.png"
  adb shell am force-stop $PKG
  n=$(adb shell "find /data/data/$PKG/files/.expo-internal -type f 2>/dev/null | wc -l" | tr -d '\r')
  echo "launch $i: ${n:-0} update files"
  if [ "${n:-0}" -gt 2 ] && [ "$i" -ge 2 ]; then break; fi
done
adb shell "ls -laR /data/data/$PKG/files/.expo-internal" > "$OUT/updates.txt" 2>&1

# Taps the element showing this text (or with this accessibility label).
tap() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb pull /sdcard/ui.xml /tmp/ui.xml >/dev/null 2>&1
  xy=$(python3 "$HERE/tap.py" /tmp/ui.xml "$1")
  if [ -n "$xy" ]; then adb shell input tap $xy; else echo "no element: $1"; fi
  sleep 3
}

seed() { # $1 lang, $2 kind
  node "$HERE/state.mjs" "$1" "$2" /tmp/state.json
  adb shell am force-stop $PKG
  adb pull $DB /tmp/RKStorage >/dev/null 2>&1 || rm -f /tmp/RKStorage
  python3 "$HERE/seed.py" /tmp/RKStorage /tmp/state.json
  adb shell rm -f $DB-wal $DB-shm $DB-journal
  adb push /tmp/RKStorage $DB >/dev/null
  owner=$(adb shell stat -c %u:%g /data/data/$PKG | tr -d '\r')
  adb shell chown "$owner" $DB
  adb shell restorecon $DB
  # A cold start so the language (and right-to-left) takes hold.
  adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null
  sleep 12
  adb shell am force-stop $PKG
}

for lang in ${LANGS:-en ar}; do
  current=""
  # The list is read on fd 3: adb would otherwise swallow the rest of it.
  while read -r kind name url steps <&3; do
    [ -z "$kind" ] && continue
    # ONLY (a pattern) limits the run to matching screen names.
    if [ -n "${ONLY:-}" ] && ! echo "$name" | grep -Eq "$ONLY"; then continue; fi
    # Steps (tap:Label) are English labels: those screens run in English only.
    if [ -n "${steps:-}" ] && [ "$lang" != en ]; then continue; fi
    if [ "$kind" != "$current" ]; then seed "$lang" "$kind"; current=$kind; fi
    adb shell am force-stop $PKG
    adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1 || true
    adb shell am start -W -a android.intent.action.VIEW -d "'$url'" $PKG >/dev/null
    sleep 9
    for step in ${steps:-}; do
      case $step in
        tap:*) tap "$(echo "${step#tap:}" | tr '_' ' ')" ;;
        key:back) adb shell input keyevent 4; sleep 3 ;;
        shot:*) adb exec-out screencap -p > "$OUT/$lang-$name-${step#shot:}.png" ;;
      esac
    done
    adb exec-out screencap -p > "$OUT/$lang-$name.png"
    echo "shot $lang-$name"
  done 3< "$HERE/screens.txt"
done

adb logcat -d -s ReactNativeJS:V ReactNative:V AndroidRuntime:E > "$OUT/logcat.txt" 2>/dev/null || true
