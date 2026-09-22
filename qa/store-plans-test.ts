// How the store's packages become the upgrade screen's tiers and prices.
import {
  annualSaving, findOfferOption, groupPackages, hasAnyPlan, offerCodeUrl, periodOf, tierOf,
} from '/home/user/CalApp/src/lib/store-plans.ts';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};
const eq = (label: string, got: unknown, want: unknown) =>
  check(label, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);

const pkg = (identifier: string, packageType: string, productId: string, price: number, extra: Record<string, unknown> = {}) => ({
  identifier,
  packageType,
  product: { identifier: productId, priceString: `SAR ${price.toFixed(2)}`, price, currencyCode: 'SAR', subscriptionPeriod: null, subscriptionOptions: null, ...extra },
});

// A typical RevenueCat offering: default monthly/annual for Pro, custom packages for Pro+.
const offering = [
  pkg('$rc_monthly', 'MONTHLY', 'calgym_pro_monthly', 12.99),
  pkg('$rc_annual', 'ANNUAL', 'calgym_pro_yearly', 129.99),
  pkg('proplus_monthly', 'CUSTOM', 'calgym_proplus_monthly', 24.99, { subscriptionPeriod: 'P1M' }),
  pkg('lifetime', 'LIFETIME', 'calgym_lifetime', 499),
];
const plans = groupPackages(offering);
eq('Pro monthly is the default monthly package', plans.pro.monthly?.product.identifier, 'calgym_pro_monthly');
eq('Pro yearly is the default annual package', plans.pro.annual?.product.identifier, 'calgym_pro_yearly');
eq('a custom Pro+ package is read from its product id and period', plans.proPlus.monthly?.product.identifier, 'calgym_proplus_monthly');
eq('Pro+ has no annual when the store sells none', plans.proPlus.annual, undefined);
check('a lifetime package is not mistaken for a subscription', !Object.values(plans).some((t) => Object.values(t).some((p) => p?.identifier === 'lifetime')));
check('the offering has something to sell', hasAnyPlan(plans));
check('an empty offering has nothing', !hasAnyPlan(groupPackages([])));

eq('"pro_plus" in an id is Pro+', tierOf(pkg('x', 'MONTHLY', 'com.calgym.pro_plus.m', 1)), 'proPlus');
eq('"pro+" in an id is Pro+', tierOf(pkg('x', 'MONTHLY', 'pro+monthly', 1)), 'proPlus');
eq('plain "pro" is Pro', tierOf(pkg('x', 'MONTHLY', 'com.calgym.pro.m', 1)), 'pro');
eq('a Play period of P1Y is annual', periodOf(pkg('x', 'CUSTOM', 'a', 1, { subscriptionPeriod: 'P1Y' })), 'annual');
eq('a name with "yearly" is annual when nothing else says', periodOf(pkg('pro_yearly', 'CUSTOM', 'a', 1)), 'annual');
eq('a weekly plan is ignored', periodOf(pkg('x', 'WEEKLY', 'a', 1, { subscriptionPeriod: 'P1W' })), null);

eq('the yearly saving is worked out from the store prices', annualSaving(plans, 'pro'), 17);
eq('no saving shown without an annual price', annualSaving(plans, 'proPlus'), null);
const dearer = groupPackages([pkg('$rc_monthly', 'MONTHLY', 'pro_m', 10), pkg('$rc_annual', 'ANNUAL', 'pro_y', 130)]);
eq('no "save" badge when the year costs more than twelve months', annualSaving(dearer, 'pro'), null);
const mixed = groupPackages([
  pkg('$rc_monthly', 'MONTHLY', 'pro_m', 10),
  { ...pkg('$rc_annual', 'ANNUAL', 'pro_y', 90), product: { ...pkg('$rc_annual', 'ANNUAL', 'pro_y', 90).product, currencyCode: 'USD' } },
]);
eq('no saving across two currencies', annualSaving(mixed, 'pro'), null);

// Play offers for percent codes.
const play = [
  pkg('$rc_monthly', 'MONTHLY', 'calgym_pro:monthly', 12.99, {
    subscriptionOptions: [{ id: 'monthly' }, { id: 'monthly:ramadan50' }, { id: 'monthly:freetrial' }],
  }),
];
eq('an offer is found by its own id', findOfferOption(play, 'ramadan50')?.optionId, 'monthly:ramadan50');
eq('  or by the full option id', findOfferOption(play, 'monthly:ramadan50')?.optionId, 'monthly:ramadan50');
eq('  in any case', findOfferOption(play, 'RAMADAN50')?.optionId, 'monthly:ramadan50');
eq('an offer the store does not have is not found', findOfferOption(play, 'summer'), null);
eq('a blank offer id finds nothing', findOfferOption(play, ' '), null);

eq('the App Store redemption link carries the code', offerCodeUrl(' RAMADAN50 '), 'https://apps.apple.com/redeem?ctx=offercodes&id=6793969631&code=RAMADAN50');

console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
