# Subscriptions and promotion codes: switching them on

The code is in place. What is left is store setup, which needs the bank
account (Paid Apps agreement on Apple, a merchant profile on Google).

## How it fits together

- **Prices live in one place: the stores.** The upgrade screen shows each
  product's own `priceString` from App Store / Google Play. That string is in
  the person's currency and includes VAT wherever the store collects it
  (Saudi Arabia and the rest of the GCC included). The prices in the admin
  console are only a fallback before launch and the basis of the revenue
  estimate.
- **RevenueCat** sits between the app and both stores. The app configures it
  with the same id it sends the server (`x-calgym-user`), so RevenueCat's
  webhook reports purchases under the id the server already knows.
- **Subscriptions switch on from the server.** The app reads the public
  RevenueCat keys from `/api/me`; until they are set, the upgrade screen says
  "Subscriptions coming soon". No app release is needed to switch on, only
  a build that contains the SDK (any build made after this change).

## Steps

> The detailed, click-by-click version for Apple — product names, prices, Arabic text, keys, RevenueCat packages, webhook and TestFlight — is in [`store-submission.md` → Apple, step by step](store-submission.md#apple-step-by-step). The summary below stays for Google.

1. **App Store Connect** → Agreements → Paid Apps (needs the bank account).
   Then Subscriptions → one group "Calgym" with:
   - `calgym_pro_monthly`, `calgym_pro_yearly`
   - `calgym_proplus_monthly` (and `calgym_proplus_yearly` if wanted)

   Set the base price in SAR; Apple fills in other countries, VAT included.
2. **Google Play Console** → Monetize → Subscriptions, same product ids, each
   with a `monthly` or `yearly` base plan.
3. **RevenueCat** → new project, add both apps:
   - Entitlements `pro` and `pro_plus`, products attached to each.
   - Offering `default` (current): packages `$rc_monthly` / `$rc_annual` for
     Pro, and custom packages `proplus_monthly` / `proplus_annual` for Pro+.
     (Any id containing "plus" is read as Pro+.)
   - Integrations → Webhooks → URL
     `https://calapp-production-ab20.up.railway.app/api/billing/revenuecat`,
     authorization header = a long random string.
4. **Railway** variables:
   - `REVENUECAT_WEBHOOK_SECRET` = that same random string
   - `REVENUECAT_IOS_KEY` = RevenueCat public key for iOS (`appl_…`)
   - `REVENUECAT_ANDROID_KEY` = RevenueCat public key for Android (`goog_…`)
   - `REVENUECAT_SECRET_KEY` = RevenueCat secret API key (v1), used only by
     `/api/billing/sync` so the plan changes the moment a purchase finishes
5. Build new binaries (iOS TestFlight + Android) and test with sandbox
   testers before release.

## Promotion codes (admin console → Promotion codes)

- **Free access**: a tier for N days, no charge. Nothing to set up in the
  stores. Limit by number of uses and/or a date window; turn off at any time.
  Doesn't touch store subscriptions: a store expiry or refund never cancels a
  gift, and someone already paying for that tier can't use one (the use
  isn't counted).
- **Percent off**: a real discount, so the store has to take the payment.
  - Apple: Subscriptions → the product → Offer Codes → create a *custom
    code* (e.g. `RAMADAN50`) with the discount and duration. Put that code
    in "App Store offer code". The app opens Apple's redemption page with the
    code filled in.
  - Google: on the base plan, add an offer with eligibility "Developer
    determined", e.g. `ramadan50`. Put its id in "Google Play offer id".
  - *Used* counts redemptions in the app. *Paid* counts the ones matched to a
    first purchase (by the offer code Apple reports, or else the person's most
    recent percent code in the last 14 days).
- To change a discount by number of uses or by date (e.g. 50% for the first
  100 people, then 30%), give the first code a use limit or an end date and
  create the next code.
- Links: `calapp://redeem?code=RAMADAN50` opens the app with the code filled in.

## Partners and commissions (admin console → Partners)

A **partner** is someone who shares your codes and earns from the sales they bring in.

1. **Add the partner** in the Partners card (name, contact, notes such as bank details).
2. **Give them a code** in the Promotion codes form:
   - *Owner* — the partner.
   - *Owner's share %* — their cut of each payment made through the code.
   - *Paid on* — every payment, the first payment only, or payments for N months (counted from the buyer's first payment).
   - *Buyer discount* — as before: a free-access code, or a percent code backed by an App Store offer code / Play offer. A code with no discount can still earn: it just tags the buyer.
3. **Link partners who brought other partners.** When X brought Z, set Z's code *Linked to* X's code and give X a share. When Z then brings W, link W's code to Z's: Z earns a share of W's sales, and a *two levels up* share goes to X. It never reaches further than two levels.

**How a sale is credited.** A buyer belongs to the first partner code they use (typed in the app's Redeem screen, or as an offer code in the App Store / Play checkout). Every payment RevenueCat reports for that buyer is split: the owner's share, the parent's share and the grandparent's share, each a percentage of what the payment actually brings in — the store price less the store's commission and tax, in US dollars. The term set on the buyer's code decides which payments count. Webhook retries never double-count, and a refund reverses exactly what that payment earned.

**Paying partners.** Earnings stay *pending* for 30 days (the refund window); after that they are *owed*. Pay partners however you like (bank transfer, etc.) and record each payment with *Record payout*. The app never sends money.

**Their own page.** *Copy link* gives each partner a private, read-only page with their codes, payments, earnings, payouts and what is owed. Buyers are never identified on it. *New link* replaces the link if it is shared too widely.

**Testing.** Sandbox (TestFlight) purchases pay nobody. To test the commission flow with sandbox purchases, set `PARTNER_COUNT_SANDBOX=1` on the server, and remove it afterwards.

**Before you launch it:** put the terms (shares, how long they last, when you pay, refunds) in a written agreement with each partner, and check how partner payments are taxed where you and they are.
