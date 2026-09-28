/**
 * Calgym's own rest-countdown layout for the lock screen and Dynamic Island.
 *
 * expo-live-activity copies the Swift files in its `ios-files` folder into
 * the widget extension when the native project is generated. Its layout puts
 * the time in a small caption under a progress bar; ours leads with the time.
 * This copies native/live-activity/*.swift over the library's copies after
 * every install (npm ci runs it on EAS too), before the project is generated.
 */
const fs = require('fs');
const path = require('path');

const from = path.join(__dirname, '..', 'native', 'live-activity');
const to = path.join(__dirname, '..', 'node_modules', 'expo-live-activity', 'ios-files');

if (!fs.existsSync(to)) {
  // Installed without the library (or it moved): nothing to patch.
  process.exit(0);
}
for (const file of fs.readdirSync(from).filter((f) => f.endsWith('.swift'))) {
  fs.copyFileSync(path.join(from, file), path.join(to, file));
  console.log(`[patch-live-activity] ${file}`);
}
