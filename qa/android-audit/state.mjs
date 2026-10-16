// Writes the sample state the Android audit seeds into the app's storage:
// node qa/android-audit/state.mjs <en|ar> <base|session> <out.json>
import fs from 'node:fs';
import { data } from '../sample-state.mjs';

const [lang = 'en', kind = 'base', out = 'state.json'] = process.argv.slice(2);
const state = { ...data(lang, kind === 'session'), installId: `u_android_audit_${lang}` };
fs.writeFileSync(out, JSON.stringify({ state, version: 16 }));
