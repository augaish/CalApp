// Light and dark mode, every tab and the main screens: no text may sit on a
// background it cannot be read against. Measures each text's colour against
// the solid background behind it (WCAG contrast); gradients are skipped
// (their text is white on a mid-tone band by design). Also checks the body
// map's silhouette stands out from its card.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:8099';
const OUT = './qa-out/dark-contrast';
fs.mkdirSync(OUT, { recursive: true });
const today = new Date();
const at = (d, h = 12) => { const x = new Date(today); x.setDate(x.getDate() - d); x.setHours(h, 0, 0, 0); if (x > today) x.setTime(today.getTime() - 60000); return x.toISOString(); };
const state = {
  language: 'en', appearance: 'dark', account: { name: 'Alex', provider: 'guest' }, tutorialSeen: true, tourSeen: true, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'male', birthDate: '1990-01-01', heightCm: 178, weightKg: 78, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2400, proteinG: 150, carbsG: 260, fatG: 80 },
  schedule: { [today.getDay()]: { title: 'Upper1', exerciseIds: ['builtin:bench-press', 'builtin:lat-pulldown'] } },
  savedSchedules: [{ id: 's1', name: 'My schedule', days: { [today.getDay()]: { title: 'Upper1', exerciseIds: ['builtin:bench-press'] } }, createdAt: at(10), activatedAt: at(10) }],
  activeScheduleId: 's1',
  workouts: [{ id: 'w1', exerciseId: 'builtin:bench-press', at: at(3), sets: [{ reps: 10, weightKg: 60, done: true }, { reps: 8, weightKg: 70, done: true }] }],
  exercises: [], recipes: [], mealPlanRecipes: {}, mealPlanSwaps: {}, shopping: null, coachMessages: [], fastingHistory: [],
  meals: [{ id: 'm1', at: at(0, 8), mealType: 'breakfast', items: [{ name: 'Oats', calories: 300, proteinG: 10, carbsG: 50, fatG: 6, portion: '1 bowl' }] }],
  water: [{ id: 'wa1', at: at(0, 9), ml: 500 }],
  weights: [
    { id: 'b1', at: at(7), kg: 78.1, bodyFatPercent: 20.8, skeletalMuscleMassKg: 35, source: 'scan', device: 'InBody 270',
      segmental: { leanKg: { leftArm: 3.5, rightArm: 3.6, trunk: 27, leftLeg: 9.5, rightLeg: 9.6 } } },
    { id: 'b2', at: at(20), kg: 78.4, bodyFatPercent: 20.6, skeletalMuscleMassKg: 35.2, source: 'manual' },
  ],
  skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {},
};
const ROUTES = ['/', '/training', '/food', '/health', '/profile', '/membership', '/upgrade', '/water', '/workout-history', '/schedules'];

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const browser = await chromium.launch();
let page;
for (const scheme of ['light', 'dark']) {
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
await ctx.addInitScript((s) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(s)); }, { state: { ...state, appearance: scheme }, version: 15 });
page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

for (const route of ROUTES) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1300);
  const bad = await page.evaluate(() => {
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    // The colour behind a point: every layer under it (parents and sibling
    // backings alike), stacked down to the first opaque one.
    const bgAt = (el, x, y) => {
      const layers = [];
      for (const n of document.elementsFromPoint(x, y)) {
        if (n === el || el.contains(n)) continue;
        const cs = getComputedStyle(n);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // a gradient or image: skip
        const c = parse(cs.backgroundColor);
        if (c && c.a > 0) { layers.push(c); if (c.a >= 0.99) break; }
      }
      let base = { r: 0, g: 0, b: 0, a: 1 };
      for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
      return base;
    };
    const out = [];
    for (const el of document.querySelectorAll('div, span')) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
      if (!own) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.bottom <= 0 || r.top >= innerHeight) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.3) continue;
      const fg = parse(cs.color);
      const px = r.x + Math.min(r.width, 12) / 2, py = r.y + r.height / 2;
      // Its middle is off the bottom of the screen: nothing there to sample.
      if (py >= innerHeight) continue;
      // Covered by something else (under the tab bar, behind a sheet): not on show.
      const top = document.elementFromPoint(px, py);
      if (top && top !== el && !el.contains(top) && !top.contains(el)) continue;
      const bg = bgAt(el, px, py);
      if (!fg || !bg) continue;
      const f = over(fg, bg);
      const L1 = lum(f), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      if (ratio < 3) out.push(`${/^[\x20-\x7e]/.test(own) ? own.slice(0, 40) : 'glyph ' + own.charCodeAt(0).toString(16)} @${Math.round(r.x)},${Math.round(r.y)} fg=${cs.color} (${ratio.toFixed(2)})`);
    }
    return out;
  });
  check(`${scheme} ${route}: every text readable (≥3:1)`, bad.length === 0, bad.slice(0, 6).join(' | '));
  await page.screenshot({ path: `${OUT}/${scheme}-${route === '/' ? 'overview' : route.slice(1)}.png` });
}
}

// The body map on Health: the neutral silhouette against its card.
await page.goto(`${BASE}/health`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1300);
const fig = await page.evaluate(() => {
  const paths = [...document.querySelectorAll('svg path')];
  const fills = paths.map((p) => p.getAttribute('fill')).filter(Boolean);
  return { count: paths.length, neutral: fills.find((f) => f.startsWith('rgba(241')) ?? null };
});
check('dark health: the body map draws its silhouette', fig.count > 20, String(fig.count));
check('dark health: unmeasured parts use the visible silhouette colour', fig.neutral === 'rgba(241,238,248,0.38)', String(fig.neutral));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
