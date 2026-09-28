// Background work (notification buttons pressed while the app is closed,
// the periodic refresh of planned notifications) must be defined before the
// app starts — see src/lib/background.ts.
import './src/lib/background';
import 'expo-router/entry';
