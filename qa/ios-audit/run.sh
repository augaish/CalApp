#!/usr/bin/env bash
# Runs on a macOS runner: installs the simulator build, seeds sample data,
# opens each screen in screens.txt (English, then Arabic) and screenshots it.
# "tap:Label" steps tap an element by its text or accessibility label with
# Maestro, which brings up the keyboard on a text box.
set -uo pipefail
APP=$1
OUT=$2
HERE=$(cd "$(dirname "$0")" && pwd)
BID=com.augaish.calapp
mkdir -p "$OUT"
UDID=$(xcrun simctl list devices available -j | python3 -c "import json,sys;d=json.load(sys.stdin)['devices'];c=[x for k,v in d.items() if 'iOS' in k for x in v if x['name'].startswith('iPhone 16 Pro') or x['name'].startswith('iPhone 17 Pro')];print(c[-1]['udid'] if c else [x for k,v in d.items() if 'iOS' in k for x in v if x['name'].startswith('iPhone')][-1]['udid'])")
echo "simulator $UDID"
defaults write com.apple.iphonesimulator ConnectHardwareKeyboard -bool false
xcrun simctl boot "$UDID"; xcrun simctl bootstatus "$UDID" -b
xcrun simctl install "$UDID" "$APP"
xcrun simctl privacy "$UDID" grant all "$BID" || true
xcrun simctl launch "$UDID" "$BID"; sleep 20
xcrun simctl io "$UDID" screenshot "$OUT/00-launch.png"
xcrun simctl terminate "$UDID" "$BID"

seed() { # $1 lang, $2 kind
  node "$HERE/../android-audit/state.mjs" "$1" "$2" /tmp/state.json
  xcrun simctl terminate "$UDID" "$BID" 2>/dev/null
  DATA=$(xcrun simctl get_app_container "$UDID" "$BID" data)
  python3 "$HERE/seed.py" "$DATA" /tmp/state.json
  # Twice: the first start applies the language (and right-to-left).
  for i in 1 2; do xcrun simctl launch "$UDID" "$BID" >/dev/null; sleep 10; xcrun simctl terminate "$UDID" "$BID"; done
}

printf 'appId: %s\n---\n- waitForAnimationToEnd\n' "$BID" > /tmp/warm.yaml; maestro --device "$UDID" test /tmp/warm.yaml >/dev/null 2>&1 || true

for lang in ${LANGS:-en ar}; do
  current=""
  while read -r kind name url steps <&3; do
    [ -z "$kind" ] && continue
    if [ -n "${ONLY:-}" ] && ! echo "$name" | grep -Eq "$ONLY"; then continue; fi
    if [ -n "${steps:-}" ] && [ "$lang" != en ]; then continue; fi
    if [ "$kind" != "$current" ]; then seed "$lang" "$kind"; current=$kind; fi
    xcrun simctl terminate "$UDID" "$BID" 2>/dev/null
    xcrun simctl launch "$UDID" "$BID" >/dev/null; sleep 6
    xcrun simctl openurl "$UDID" "$url"; sleep 3
    # iOS asks "Open in “Calgym”?" for a link: Open, then any tap steps.
    {
      printf 'appId: %s\n---\n' "$BID"
      # The link prompt, and the phone's notification question if it shows.
      for b in Allow Open Allow; do printf -- '- extendedWaitUntil:\n    visible: "%s"\n    timeout: 4000\n    optional: true\n- tapOn:\n    text: "%s"\n    optional: true\n' "$b" "$b"; done
      printf -- '- waitForAnimationToEnd\n'
      for step in ${steps:-}; do
        case $step in
          tap:*) printf -- '- tapOn:\n    text: "%s"\n- waitForAnimationToEnd\n' "$(echo "${step#tap:}" | tr '_' ' ')" ;;
          # The keyboard's one-time swipe-typing tip, if it shows.
          maybe:*) printf -- '- tapOn:\n    text: "%s"\n    optional: true\n- waitForAnimationToEnd\n' "$(echo "${step#maybe:}" | tr '_' ' ')" ;;
        esac
      done
    } > /tmp/flow.yaml
    maestro --device "$UDID" test /tmp/flow.yaml >/tmp/maestro.log 2>&1 || { echo "maestro: $name"; tail -5 /tmp/maestro.log; }
    sleep 3
    xcrun simctl io "$UDID" screenshot "$OUT/$lang-$name.png"
    echo "shot $lang-$name"
  done 3< "$HERE/screens.txt"
done
