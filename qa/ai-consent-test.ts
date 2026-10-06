// AI permission: declining is quiet (nothing to report), and every route that
// sends a person's photos, reports or words to an AI provider is behind the
// permission check — so a new AI feature cannot slip past it.
import fs from 'node:fs';
import { AiConsentDeclinedError, ApiError, aiFailureAction } from '/home/user/CalApp/src/lib/api-errors.ts';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};
const unusable = { titleKey: 'x.title', bodyKey: 'x.body' };
check('declined: nothing to report', aiFailureAction(new AiConsentDeclinedError(), unusable).kind === 'none');
check('an offline failure still says offline', (aiFailureAction(new TypeError('fetch'), unusable) as { titleKey?: string }).titleKey === 'common.offlineTitle');
check('a service failure still says so', (aiFailureAction(new ApiError('ai_overloaded'), unusable) as { titleKey?: string }).titleKey === 'common.aiDownTitle');

const api = fs.readFileSync('/home/user/CalApp/src/lib/api.ts', 'utf8');
const gated = new Set([...api.slice(api.indexOf('const AI_PATHS'), api.indexOf(']);', api.indexOf('const AI_PATHS'))).matchAll(/'(\/api\/[^']+)'/g)].map((m) => m[1]));
// Every exported AI function's route must be gated.
const aiFns = [...api.matchAll(/export async function (analyze\w+|refineMeal|coachChat|generate\w+)\(([\s\S]*?)\n\}/g)];
check('found the AI functions', aiFns.length >= 9, String(aiFns.length));
for (const [, name, body] of aiFns) {
  for (const [, path] of body.matchAll(/post(?:<[^>]+>)?\('(\/api\/[^']+)'/g)) {
    check(`${name} → ${path} asks permission first`, gated.has(path));
  }
}
check('the gate runs before anything is fetched', /if \(AI_PATHS\.has\(path\) && !\(await ensureAiConsent\(\)\)\) throw new AiConsentDeclinedError\(\);\s*const res = await fetch/.test(api));

// Every screen that calls an AI function stops quietly on a decline.
const callers = ['src/app/photo-analyze.tsx', 'src/app/describe.tsx', 'src/app/body-reading.tsx', 'src/components/refine-box.tsx', 'src/app/scan.tsx', 'src/app/inbody-web.tsx', 'src/app/exercise-edit.tsx', 'src/app/recipes.tsx', 'src/app/program-build.tsx', 'src/app/program-tailor.tsx', 'src/app/coach.tsx'];
for (const f of callers) {
  const src = fs.readFileSync(`/home/user/CalApp/${f}`, 'utf8');
  check(`${f} handles a decline`, src.includes('AiConsentDeclinedError') || /action\.kind [!=]== 'none'/.test(src));
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
