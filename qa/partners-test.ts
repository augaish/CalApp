// Partner commissions: net revenue, three-level split, terms, refunds' shape,
// balances with the refund hold, and the admin's input rules.
import {
  balance, cleanEarning, cleanPartner, isRefundEvent, isSaleEvent, netRevenue, splitSale, withinTerm,
  type CodeEarning,
} from '/home/user/CalApp/server/src/partners.ts';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};
const eq = (label: string, got: unknown, want: unknown) =>
  check(label, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);

// ── what a sale brings in ──
eq('net: price less store commission and tax', netRevenue({ price: 10, commission_percentage: 0.15, tax_percentage: 0.1 }), { usd: 7.5, estimated: false });
eq('net: takehome when that is all there is', netRevenue({ price: 10, takehome_percentage: 0.7 }), { usd: 7, estimated: false });
eq('net: nothing reported → 15% fee, flagged estimated', netRevenue({ price: 10 }), { usd: 8.5, estimated: true });
eq('net: a free trial brings nothing', netRevenue({ price: 0 }), null);
eq('net: a refund comes back negative', netRevenue({ price: -10, commission_percentage: 0.15, tax_percentage: 0 }), { usd: -8.5, estimated: false });

// ── the split ──
const code = (c: Partial<CodeEarning>): CodeEarning => ({
  code: 'W10', partnerId: 'pW', commissionPct: 20, term: 'lifetime', termMonths: null, parentCode: 'Z10', parentPct: 5, grandparentPct: 2, ...c,
});
const W = code({});
const Z = code({ code: 'Z10', partnerId: 'pZ', parentCode: 'X10' });
const X = code({ code: 'X10', partnerId: 'pX', parentCode: null });
const on = (id: string) => ({ id, active: true });
eq('W sells $10 net: W 20%, Z 5%, X 2%', splitSale(10, [{ code: W, partner: on('pW') }, { code: Z, partner: on('pZ') }, { code: X, partner: on('pX') }]), [
  { level: 0, partnerId: 'pW', viaCode: 'W10', pct: 20, amountUsd: 2 },
  { level: 1, partnerId: 'pZ', viaCode: 'Z10', pct: 5, amountUsd: 0.5 },
  { level: 2, partnerId: 'pX', viaCode: 'X10', pct: 2, amountUsd: 0.2 },
]);
eq('one level: only W and Z', splitSale(10, [{ code: code({ grandparentPct: 0 }), partner: on('pW') }, { code: Z, partner: on('pZ') }]).map((l) => l.partnerId), ['pW', 'pZ']);
eq('a switched-off partner earns nothing, the others still do', splitSale(10, [{ code: W, partner: on('pW') }, { code: Z, partner: { id: 'pZ', active: false } }, { code: X, partner: on('pX') }]).map((l) => l.partnerId), ['pW', 'pX']);
eq('a code without an owner still pays the parent', splitSale(10, [{ code: W, partner: null }, { code: Z, partner: on('pZ') }]).map((l) => [l.partnerId, l.amountUsd]), [['pZ', 0.5]]);
eq('never beyond two levels up', splitSale(10, [{ code: W, partner: on('pW') }, { code: Z, partner: on('pZ') }, { code: X, partner: on('pX') }, { code: X, partner: on('pQ') }]).length, 3);
eq('a refund splits negative, the same way', splitSale(-10, [{ code: W, partner: on('pW') }]).map((l) => l.amountUsd), [-2]);
eq('cents are rounded', splitSale(3.33, [{ code: code({ commissionPct: 15 }), partner: on('pW') }])[0].amountUsd, 0.5);

// ── terms ──
const first = '2026-01-15T00:00:00Z';
check('the first sale always earns', withinTerm('first', null, null, new Date('2026-01-15')));
check('"first payment": a renewal does not', !withinTerm('first', null, first, new Date('2026-02-15')));
check('"12 months": month 11 earns', withinTerm('months', 12, first, new Date('2026-12-14')));
check('"12 months": month 13 does not', !withinTerm('months', 12, first, new Date('2027-01-16')));
check('"lifetime": year 3 earns', withinTerm('lifetime', null, first, new Date('2029-01-15')));

// ── event kinds ──
check('sales: purchase, renewal, one-off', ['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE'].every(isSaleEvent) && !isSaleEvent('CANCELLATION') && !isSaleEvent('EXPIRATION'));
check('refund: cancellation by support', isRefundEvent({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' }));
check('refund: cancellation with a negative price', isRefundEvent({ type: 'CANCELLATION', price: -9.99 }));
check('not a refund: someone just turning renewal off', !isRefundEvent({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE', price: 0 }));

// ── balances ──
const now = new Date('2026-06-30T00:00:00Z');
const lines = [
  { amountUsd: 10, at: '2026-05-01T00:00:00Z' }, // settled
  { amountUsd: 4, at: '2026-06-20T00:00:00Z' }, // still in the refund window
  { amountUsd: -2, at: '2026-05-10T00:00:00Z' }, // a refund, settled
];
eq('balance: earned, pending, paid, owed', balance(lines, [{ amountUsd: 5 }], now), { earned: 12, pending: 4, paid: 5, owed: 3 });
eq('balance: owed never goes below zero', balance(lines, [{ amountUsd: 50 }], now).owed, 0);

// ── admin input ──
check('partner needs a name', !cleanPartner({ name: ' ' }).ok && cleanPartner({ name: 'Sara' }).ok);
const codes: Record<string, { partnerId: string | null; parentCode: string | null }> = {
  X10: { partnerId: 'pX', parentCode: null },
  Z10: { partnerId: 'pZ', parentCode: 'X10' },
  ANON: { partnerId: null, parentCode: null },
};
const look = (c: string) => codes[c] ?? null;
const ok = cleanEarning('W10', { partnerId: 'pW', commissionPct: '20', term: 'months', termMonths: '12', parentCode: 'z-10', parentPct: 5, grandparentPct: 2 }, look);
eq('a full two-level code', ok.ok && ok.value, { partnerId: 'pW', commissionPct: 20, term: 'months', termMonths: 12, parentCode: 'Z10', parentPct: 5, grandparentPct: 2 });
const noGrand = cleanEarning('W10', { partnerId: 'pW', commissionPct: 20, parentCode: 'X10', parentPct: 5, grandparentPct: 2 }, look);
eq('linked to a top-level code: the grandparent share drops to 0', noGrand.ok && noGrand.value.grandparentPct, 0);
eq('no link: no parent shares', (() => { const r = cleanEarning('W10', { partnerId: 'pW', commissionPct: 20, parentPct: 5 }, look); return r.ok && [r.value.parentPct, r.value.grandparentPct]; })(), [0, 0]);
eq('refused: link to itself', cleanEarning('X10', { parentCode: 'X10' }, look), { ok: false, error: 'link_to_itself' });
eq('refused: a loop', cleanEarning('X10', { partnerId: 'pX', parentCode: 'Z10', parentPct: 5 }, look), { ok: false, error: 'link_loop' });
eq('refused: unknown parent', cleanEarning('W10', { parentCode: 'NOPE' }, look), { ok: false, error: 'parent_not_found' });
eq('refused: parent with no partner to pay', cleanEarning('W10', { parentCode: 'ANON', parentPct: 5 }, look), { ok: false, error: 'parent_has_no_partner' });
eq('refused: shares over 100%', cleanEarning('W10', { partnerId: 'pW', commissionPct: 90, parentCode: 'Z10', parentPct: 10, grandparentPct: 5 }, look), { ok: false, error: 'shares_over_100' });
eq('refused: a percentage out of range', cleanEarning('W10', { partnerId: 'pW', commissionPct: 120 }, look), { ok: false, error: 'percent_out_of_range' });
eq('refused: months out of range', cleanEarning('W10', { partnerId: 'pW', term: 'months', termMonths: 0 }, look), { ok: false, error: 'months_out_of_range' });
eq('no owner: no owner commission stored', (() => { const r = cleanEarning('W10', { commissionPct: 20 }, look); return r.ok && r.value.commissionPct; })(), 0);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
