// Side-by-side: the board's phone frame (cropped from the PNG) beside the implementation shot, EN and AR.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const H = '/tmp/claude-0/-home-user-CalApp/ecae7b05-0468-5173-bf98-63d45483ae6b/scratchpad/handoff/calgym-design-handoff-v1.1/screens';
const S = process.env.SHOTS || '/tmp/claude-0/-home-user-CalApp/ecae7b05-0468-5173-bf98-63d45483ae6b/scratchpad/shots19';
const OUT = '/tmp/claude-0/-home-user-CalApp/ecae7b05-0468-5173-bf98-63d45483ae6b/scratchpad/evidence/compare';
fs.mkdirSync(OUT, { recursive: true });
// [screen, title, board file, side (0 left / 1 right), shot basename]
const MAP = [
  ['S01', 'Overview', '01-overview-food.png', 0, 'overview'],
  ['S02', 'Food', '01-overview-food.png', 1, 'food'],
  ['S03', 'Health', '02-health-readings.png', 0, 'health'],
  ['S04', 'Add reading', '02-health-readings.png', 1, 'bodyreading'],
  ['S05', 'Training', '03-training-session.png', 0, 'training'],
  ['S06', 'Session', '03-training-session.png', 1, 'session'],
  ['S07', 'Saved schedules', '04-schedules-activation.png', 0, 'schedules'],
  ['S08', 'Activate schedule', '04-schedules-activation.png', 1, 'activate'],
  ['S09', 'Recipes', '05-recipes-detail.png', 0, 'recipes'],
  ['S10', 'Recipe', '05-recipes-detail.png', 1, 'recipe'],
  ['S11', 'Meal plan', '06-plan-shopping.png', 0, 'foodplan'],
  ['S12', 'Shopping', '06-plan-shopping.png', 1, 'shopping'],
  ['S13', 'Log eaten', '07-portion-replace.png', 0, 'logportion'],
  ['S14', 'Review change', '07-portion-replace.png', 1, 'planmeal'],
  ['S15', 'Add', '08-add-barcode.png', 0, 'add-menu'],
  ['S16', 'Product not found', '08-add-barcode.png', 1, 'product-not-found'],
  ['S17', 'Weekly review', '09-review-ai.png', 0, 'review'],
  ['S18', 'AI Support', '09-review-ai.png', 1, 'coach'],
  ['S19', 'Welcome', '10-onboarding-profile.png', 0, 'login'],
  ['S20', 'Profile', '10-onboarding-profile.png', 1, 'profile'],
];
const b64 = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });
const made = [];
for (const [id, title, board, side, shotBase] of MAP) {
  for (const lang of ['en', 'ar']) {
    const shotPath = `${S}/${shotBase}-${lang}.png`;
    if (!fs.existsSync(shotPath)) continue;
    const html = `<html><body style="margin:0;background:#F3F1FA;font-family:system-ui;padding:16px 20px">
      <div style="display:flex;gap:24px;align-items:flex-start">
        <div><div style="font:600 13px system-ui;color:#4C3D7A;margin-bottom:8px">${id} · ${title} — board (reference)</div>
          <div id="board" style="width:460px;height:820px;overflow:hidden;border-radius:16px;background:#fff;box-shadow:0 2px 8px rgba(33,27,46,.12)"><img id="bimg" src="${b64(`${H}/${board}`)}" style="display:block"/></div></div>
        <div><div style="font:600 13px system-ui;color:#4C3D7A;margin-bottom:8px">Implementation — web export, 390 × 844 viewport, ${lang === 'ar' ? 'Arabic' : 'English'}</div>
          <div style="width:460px;height:820px;overflow:hidden;border-radius:16px;background:#fff;box-shadow:0 2px 8px rgba(33,27,46,.12)"><img src="${b64(shotPath)}" style="width:460px;display:block"/></div></div>
      </div></body></html>`;
    await page.setContent(html);
    await page.evaluate((side) => {
      const img = document.getElementById('bimg');
      const W = img.naturalWidth, Hh = img.naturalHeight;
      // Each board holds two phone frames; crop the requested one at the frame's own scale.
      const frame = { x: side === 0 ? W * 0.075 : W * 0.515, y: Hh * 0.06, w: W * 0.41, h: Hh * 0.935 };
      const scale = 460 / frame.w;
      img.style.width = `${W * scale}px`;
      img.style.marginLeft = `${-frame.x * scale}px`;
      img.style.marginTop = `${-frame.y * scale}px`;
    }, side);
    await page.waitForTimeout(150);
    const out = `${OUT}/${id}-${lang}.jpg`;
    await page.screenshot({ path: out, type: 'jpeg', quality: 78, clip: { x: 0, y: 0, width: 1000, height: 880 } });
    made.push(out);
  }
}
await browser.close();
console.log(made.length, 'composites');
