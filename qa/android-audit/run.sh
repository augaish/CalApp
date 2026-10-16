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

# Two cold starts: the first downloads the preview update, the second runs it.
for i in 1 2; do
  adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null
  sleep 45
  adb exec-out screencap -p > "$OUT/00-launch-$i.png"
  adb shell am force-stop $PKG
done

adb root >/dev/null; sleep 3

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

for lang in en ar; do
  current=""
  # The list is read on fd 3: adb would otherwise swallow the rest of it.
  while read -r kind name url <&3; do
    [ -z "$kind" ] && continue
    if [ "$kind" != "$current" ]; then seed "$lang" "$kind"; current=$kind; fi
    adb shell am force-stop $PKG
    adb shell am start -W -a android.intent.action.VIEW -d "'$url'" $PKG >/dev/null
    sleep 9
    adb exec-out screencap -p > "$OUT/$lang-$name.png"
    echo "shot $lang-$name"
  done 3< "$HERE/screens.txt"
done

adb logcat -d -s ReactNativeJS:V ReactNative:V AndroidRuntime:E > "$OUT/logcat.txt" 2>/dev/null || true
