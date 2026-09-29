#!/usr/bin/env bash
# Expo modules ship precompiled iOS frameworks (prebuilds/…/*.tar.gz). A
# module's newer patch release can be compiled against a newer
# ExpoModulesCore than the one installed; iOS then refuses to launch the app
# ("DYLD Symbol missing", as build 18 did with expo-print 57.0.2).
#
# This lists every ExpoModulesCore symbol each prebuilt framework needs and
# fails when the installed ExpoModulesCore doesn't define it. Run it after
# npm ci, before an iOS build. Needs llvm-nm (on GitHub's Ubuntu runners).
set -euo pipefail

NM=$(command -v llvm-nm || ls /usr/lib/llvm-*/bin/llvm-nm 2>/dev/null | tail -1 || true)
if [ -z "$NM" ]; then
  echo "::warning::llvm-nm not found; skipping the iOS prebuild check"
  exit 0
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

core_tar=node_modules/expo-modules-core/prebuilds/output/release/xcframeworks/ExpoModulesCore.tar.gz
if [ ! -f "$core_tar" ]; then
  echo "ExpoModulesCore has no prebuild here; nothing to compare against."
  exit 0
fi
mkdir -p "$work/core"
tar xzf "$core_tar" -C "$work/core" 2>/dev/null
core_bin=$(find "$work/core" -path '*ios-arm64/ExpoModulesCore.framework/ExpoModulesCore' | head -1)
"$NM" -gU --defined-only "$core_bin" | awk '{print $NF}' | sort -u > "$work/core.syms"

bad=0
for tarball in node_modules/*/prebuilds/output/release/xcframeworks/*.tar.gz \
               node_modules/@*/*/prebuilds/output/release/xcframeworks/*.tar.gz; do
  [ -f "$tarball" ] || continue
  case "$tarball" in node_modules/expo-modules-core/*) continue ;; esac
  name=$(basename "$tarball" .tar.gz)
  pkg=$(echo "$tarball" | sed -E 's#^node_modules/((@[^/]+/)?[^/]+)/.*#\1#')
  dir="$work/$name"
  mkdir -p "$dir"
  tar xzf "$tarball" -C "$dir" 2>/dev/null
  bin=$(find "$dir" -path "*ios-arm64/$name.framework/$name" | head -1)
  [ -n "$bin" ] || continue
  "$NM" -u "$bin" | awk '{print $NF}' | grep '15ExpoModulesCore' | sort -u > "$dir.needs" || true
  missing=$(comm -23 "$dir.needs" "$work/core.syms")
  if [ -n "$missing" ]; then
    bad=1
    version=$(node -p "require('./node_modules/$pkg/package.json').version")
    echo "::error::$pkg $version was built for a newer ExpoModulesCore; the app would crash at launch. Pin an earlier $pkg version."
    echo "$missing" | head -5 | sed 's/^/  missing: /'
  else
    echo "ok  $pkg ($name)"
  fi
done
exit $bad
