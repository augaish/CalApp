// The model sometimes writes JSON with a small slip — the refine-meal failure
// "Expected ',' or ']' after array element" was a missing comma between two
// items. extractJson mends those before giving up.
import { extractJson, repairJson } from '../server/src/parse.ts';
const cases: [string, unknown][] = [
  ['{"items":[{"name":"a","calories":1}\n    {"name":"b","calories":2}],"confidence":0.8}', 2],
  ['{"items":[{"name":"a, b","calories":1,},],}', 1],
  ['{"items":[{"name":"x // not a comment","calories":1} // c\n],"notes":"he said \\"hi\\"" /* x */}', 1],
  ['Here: {"items":[{"name":"a","calories": 5\n "proteinG": 2}]} thanks', 1],
  ['{"a":true\n"b":null\n"c":-1}', 'ok'],
];
let bad = 0;
for (const [s, n] of cases) {
  try { const v = extractJson(s) as any; const ok = n === 'ok' ? v.c === -1 && v.a === true : v.items.length === n; if (!ok) bad++; console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(v)); }
  catch (e) { bad++; console.log('FAIL', String(e), repairJson(s)); }
}
process.exit(bad);
