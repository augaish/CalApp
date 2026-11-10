#!/usr/bin/env bash
# Screen recordings for the launch videos, on a macOS runner's iPhone
# simulator: "set" logs sets in a workout (with the rest timer between),
# "meal" scans a meal photo through to saving it. Each runs in English and
# Arabic. The meal flow signs in as the review account (REVIEW_CODE from the
# workflow's secret) so the AI answers. Recordings land in $OUT as .mp4.
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
# A clean status bar, as in store screenshots.
xcrun simctl status_bar "$UDID" override --time "9:41" --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4 || true
xcrun simctl install "$UDID" "$APP"
xcrun simctl privacy "$UDID" grant all "$BID" || true
# The meal photo the scan picks from the library.
sips -s format jpeg "$HERE/../../assets/dishes/rice_chicken.webp" --out /tmp/kabsa.jpg >/dev/null && xcrun simctl addmedia "$UDID" /tmp/kabsa.jpg
xcrun simctl launch "$UDID" "$BID"; sleep 20; xcrun simctl terminate "$UDID" "$BID"
printf 'appId: %s\n---\n- waitForAnimationToEnd\n' "$BID" > /tmp/warm.yaml; maestro --device "$UDID" test /tmp/warm.yaml >/dev/null 2>&1 || true

seed() { # $1 lang, $2 kind (signedout: the sample data with no account, so the app opens on sign-in)
  node "$HERE/../android-audit/state.mjs" "$1" "${2/signedout/base}" /tmp/state.json
  if [ "$2" = signedout ]; then node -e "const f='/tmp/state.json',fs=require('fs'),s=JSON.parse(fs.readFileSync(f));delete s.state.account;fs.writeFileSync(f,JSON.stringify(s))"; fi
  # The sample's workout is set at 18:20; on camera it should be under way now, with no rest running yet.
  if [ "$2" = session ]; then node -e "const f='/tmp/state.json',fs=require('fs'),s=JSON.parse(fs.readFileSync(f));const a=s.state.activeSession;if(a){a.startedAt=new Date(Date.now()-12*60000).toISOString();a.restEndsAt=null;a.restNext=null;}fs.writeFileSync(f,JSON.stringify(s))"; fi
  xcrun simctl terminate "$UDID" "$BID" 2>/dev/null
  DATA=$(xcrun simctl get_app_container "$UDID" "$BID" data)
  python3 "$HERE/../ios-audit/seed.py" "$DATA" /tmp/state.json
  for i in 1 2; do xcrun simctl launch "$UDID" "$BID" >/dev/null; sleep 10; xcrun simctl terminate "$UDID" "$BID"; done
}
# Waits that Maestro has no step for: wait for text that never shows.
pause() { printf -- '- extendedWaitUntil:\n    visible: "zzz-never-zzz"\n    timeout: %s\n    optional: true\n' "$1"; }
prompts() { for b in Allow Open Allow; do printf -- '- extendedWaitUntil:\n    visible: "%s"\n    timeout: 3000\n    optional: true\n- tapOn:\n    text: "%s"\n    optional: true\n' "$b" "$b"; done; }
open_url() { # $1 url: opens it and answers iOS's "Open in Calgym?"
  xcrun simctl launch "$UDID" "$BID" >/dev/null; sleep 6
  xcrun simctl openurl "$UDID" "$1"; sleep 2
  { printf 'appId: %s\n---\n' "$BID"; prompts; printf -- '- waitForAnimationToEnd\n'; } > /tmp/pre.yaml
  maestro --device "$UDID" test /tmp/pre.yaml >/dev/null 2>&1 || true
}
evidence() { # $1 name: what the screen showed when a step failed
  xcrun simctl io "$UDID" screenshot "$OUT/$1.fail.png" >/dev/null 2>&1
  maestro --device "$UDID" hierarchy > "$OUT/$1.hierarchy.json" 2>/dev/null || true
}
record() { # $1 name, $2 flow file
  xcrun simctl io "$UDID" recordVideo --codec=h264 --force "/tmp/$1.mov" & REC=$!
  sleep 2
  maestro --device "$UDID" test "$2" > "/tmp/$1.log" 2>&1 || { echo "maestro: $1"; tail -20 "/tmp/$1.log"; tail -40 "/tmp/$1.log" > "$OUT/$1.maestro.txt"; evidence "$1"; }
  sleep 2
  kill -INT $REC; wait $REC 2>/dev/null
  # Smaller for sharing: 886 px wide, H.264.
  ffmpeg -loglevel error -y -i "/tmp/$1.mov" -vf "scale=886:-2" -c:v libx264 -crf 24 -preset veryfast -pix_fmt yuv420p -movflags +faststart "$OUT/$1.mp4"
  echo "recorded $1 ($(du -h "$OUT/$1.mp4" | cut -f1))"
}

for lang in ${LANGS:-ar en}; do
  # Matched by part of the name: iPhone reads a button's icon into its name.
  if [ "$lang" = ar ]; then COMPLETE='.*إتمام المجموعة.*'; SKIP='.*تخطي الراحة.*'; SCAN='.*مسح وجبة.*'; UPLOAD='.*من الصور.*'; SIGNIN='.*تسجيل الدخول.*'; SEND='.*أرسل لي رمزاً.*'; LOGMEAL='.*سجّل هذه الوجبة.*'; else COMPLETE='.*Complete set.*'; SKIP='.*Skip rest.*'; SCAN='.*Scan meal.*'; UPLOAD='.*Upload.*'; SIGNIN='Sign in'; SEND='.*Send me a code.*'; LOGMEAL='.*Log this meal.*'; fi

  if echo "${FLOWS:-set meal}" | grep -q set; then
    seed "$lang" session
    open_url "calapp://session"
    {
      printf 'appId: %s\n---\n' "$BID"
      pause 2500
      printf -- '- tapOn:\n    text: "%s"\n' "$COMPLETE"
      pause 6000
      printf -- '- tapOn:\n    text: "%s"\n    optional: true\n' "$SKIP"
      pause 2500
      printf -- '- tapOn:\n    text: "%s"\n' "$COMPLETE"
      pause 5000
    } > /tmp/set.yaml
    record "$lang-log-set" /tmp/set.yaml
    xcrun simctl terminate "$UDID" "$BID"
  fi

  if echo "${FLOWS:-set meal}" | grep -q meal && [ -n "${REVIEW_CODE:-}" ]; then
    seed "$lang" signedout
    # Signed in as the review account (it has a plan), before recording.
    xcrun simctl launch "$UDID" "$BID" >/dev/null; sleep 8
    {
      printf 'appId: %s\n---\n' "$BID"
      prompts
      printf -- '- scrollUntilVisible:\n    element:\n      text: "%s"\n    optional: true\n' "$SIGNIN"
      printf -- '- tapOn:\n    text: "%s"\n- waitForAnimationToEnd\n' "$SIGNIN"
      printf -- '- inputText: "review@calgym.org"\n- tapOn:\n    text: "%s"\n- waitForAnimationToEnd\n' "$SEND"
      printf -- '- inputText: "%s"\n' "$REVIEW_CODE"
      pause 8000
      printf -- '- tapOn:\n    text: "OK"\n    optional: true\n- tapOn:\n    text: "حسناً"\n    optional: true\n'
    } > /tmp/login.yaml
    maestro --device "$UDID" test /tmp/login.yaml > "/tmp/$lang-login.log" 2>&1 || { echo "login failed"; tail -20 "/tmp/$lang-login.log"; tail -40 "/tmp/$lang-login.log" > "$OUT/$lang-login.maestro.txt"; evidence "$lang-login"; }
    xcrun simctl terminate "$UDID" "$BID"
    open_url "calapp://food"
    {
      printf 'appId: %s\n---\n' "$BID"
      pause 2000
      printf -- '- tapOn:\n    text: "%s"\n' "$SCAN"
      prompts
      pause 2000
      printf -- '- tapOn:\n    text: "%s"\n' "$UPLOAD"
      pause 2500
      # The photo picker shows the library: the newest photo is the kabsa.
      printf -- '- tapOn:\n    text: "Photo.*"\n    index: 0\n    optional: true\n'
      printf -- '- extendedWaitUntil:\n    visible: "%s"\n    timeout: 90000\n' "$LOGMEAL"
      pause 3000
      printf -- '- scrollUntilVisible:\n    element:\n      text: "%s"\n    optional: true\n' "$LOGMEAL"
      printf -- '- tapOn:\n    text: "%s"\n' "$LOGMEAL"
      pause 4000
    } > /tmp/meal.yaml
    record "$lang-scan-meal" /tmp/meal.yaml
    xcrun simctl terminate "$UDID" "$BID"
  fi
done
