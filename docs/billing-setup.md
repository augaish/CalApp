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
