// #30: a photo-read product is one person's reading until a person checks it.
process.env.DATABASE_URL = 'postgres://postgres@localhost:55433/postgres';
const db = await import('/home/user/CalApp/server/src/db.ts');

let fails = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
};

await db.initDb();

const item = (name: string, calories: number) => ({
  name, calories, proteinG: 3, carbsG: 5, fatG: 3, portion: '100 ml',
});
const ALICE = 'user-alice';
const BOB = 'user-bob';
const CODE = '6281007011419';

// ── An OFF product is published straight away ────────────────────────────
console.log('— Open Food Facts —');
await db.setCachedBarcode('1111111111111', item('Known product', 50), 'off');
const off = await db.getCachedBarcode('1111111111111', BOB);
eq('an OFF product is served to anyone', (off?.item as { name: string })?.name, 'Known product');
eq('  as published', off?.status, 'published');

// ── A photo read starts pending, and is private to its contributor ───────
console.log('\n— one person’s reading —');
const first = await db.submitBarcode(CODE, item('Almarai Milk', 64), ALICE);
eq('the submission is recorded', first.recorded, true);
eq('  and nothing conflicts yet', first.conflicting, false);

const toAlice = await db.getCachedBarcode(CODE, ALICE);
eq('Alice gets her own reading back', (toAlice?.item as { name: string })?.name, 'Almarai Milk');
eq('  marked pending', toAlice?.status, 'pending');

const toBob = await db.getCachedBarcode(CODE, BOB);
eq('THE RULE: Bob does NOT get an unchecked reading', toBob, null);
const toAnon = await db.getCachedBarcode(CODE, null);
eq('  nor does an anonymous caller', toAnon, null);

// ── A disagreeing second reading is kept, not dropped ────────────────────
console.log('\n— two people disagree —');
const second = await db.submitBarcode(CODE, item('Almarai Milk', 140), BOB);
eq('the second reading is recorded too', second.recorded, true);
eq('  and flagged as conflicting', second.conflicting, true);
const close = await db.submitBarcode(CODE, item('Almarai Milk', 66), ALICE);
eq('a reading that broadly agrees is not flagged', close.conflicting, false);

// ── A retry of the same reading is the same contribution ─────────────────
const retry = await db.submitBarcode(CODE, item('Almarai Milk', 66), ALICE);
eq('a retried identical submission is accepted', retry.recorded, true);

let queue = await db.barcodeQueue();
eq('the product is in the review queue', queue.length, 1);
eq('  with every competing reading attached, the retry not duplicated', queue[0].submissions.length, 3);
eq('  showing the calorie figures to compare', queue[0].submissions.map((s) => (s.item as { calories: number }).calories).sort((a, b) => a - b), [64, 66, 140]);

// ── A person publishes it ────────────────────────────────────────────────
console.log('\n— a person checks it —');
eq('publishing succeeds', await db.reviewBarcode(CODE, 'publish', item('Almarai Full Fat Milk', 64)), true);
const published = await db.getCachedBarcode(CODE, BOB);
eq('now Bob gets it', (published?.item as { name: string })?.name, 'Almarai Full Fat Milk');
eq('  as published', published?.status, 'published');
queue = await db.barcodeQueue();
eq('and it leaves the queue', queue.length, 0);

// ── Reports pull a bad product back out of circulation ───────────────────
console.log('\n— reported as wrong —');
eq('one report is not enough', await db.flagBarcode(CODE), 1);
eq('  still served', (await db.getCachedBarcode(CODE, BOB))?.status, 'published');
await db.flagBarcode(CODE);
eq('three reports pull it', await db.flagBarcode(CODE), 3);
eq('  and it stops being served to others', await db.getCachedBarcode(CODE, BOB), null);
queue = await db.barcodeQueue();
eq('  landing back in the queue', queue.length, 1);
eq('  with its report count', queue[0].flags, 3);

// An OFF product is never pulled by reports — it is not ours to unpublish.
for (let i = 0; i < 5; i++) await db.flagBarcode('1111111111111');
eq('reports never unpublish an Open Food Facts product', (await db.getCachedBarcode('1111111111111', BOB))?.status, 'published');

// ── Rejection ────────────────────────────────────────────────────────────
console.log('\n— rejection —');
eq('rejecting succeeds', await db.reviewBarcode(CODE, 'reject'), true);
eq('  and it is served to nobody, not even its contributor', await db.getCachedBarcode(CODE, ALICE), null);
eq('  and is out of the queue', (await db.barcodeQueue()).length, 0);

// ── Contribution cap ─────────────────────────────────────────────────────
console.log('\n— contribution cap —');
const before = await db.submissionsToday(ALICE);
for (let i = 0; i < 5; i++) await db.submitBarcode(`900000000000${i}`, item(`P${i}`, 100), ALICE);
eq('submissions are counted per person per day', (await db.submissionsToday(ALICE)) - before, 5);
eq('  and another person is counted separately', await db.submissionsToday('user-carol'), 0);

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
