# Calgym launch, step by step

Everything that's left before and after the bank account, in order. The ready-to-paste text (descriptions, keywords, privacy label answers, review notes) is in [`store-submission.md`](store-submission.md). This page says what to click and when.

**Status:** ✅ done · ⬜ to do · 🏦 waits for the bank account

**Server:** `https://calapp-production-ab20.up.railway.app` · **Bundle / package ID:** `com.augaish.calapp` · **App Store ID:** `6793969631`

---

## 0. Already done
- ✅ iPhone signing, including the lock-screen widget (build 15 is on TestFlight; build 16 carries the new countdown layout).
- ✅ Railway: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPPORT_EMAIL`.
- ✅ Apple tax forms (W-8BEN) and the Free Apps agreement.
- ✅ Privacy policy, terms, support and account-deletion pages are live.

---

## 1. Apple account (today)

### 1.1 ⬜ App Store Small Business Program
It cuts Apple's commission from **30% to 15%**. Without it, Apple takes 30% of every subscription's first year.
1. Go to **developer.apple.com/app-store/small-business-program** → **Enroll**.
2. Sign in with your developer Apple ID.
3. Associated developer accounts: **none**.
4. Accept and submit. Apple confirms by email.

Enroll **before the first sale**: the 15% rate applies from Apple's confirmation onwards, not backwards.

### 1.2 🏦 Bank account
App Store Connect → **Business** → **Add Bank Account**. A personal account is correct, because the developer account is an individual one.
- The **Paid Apps Agreement** then turns from "Pending User Info" to **Active**. Apple can take a day or two.
- Everything in sections 2–8 can be done before this.

---

## 2. ⬜ Subscriptions (App Store Connect → your app → Monetization → Subscriptions)

### 2.1 Subscription group
- Reference name: `Calgym Membership`
- Localization → display name: English `Calgym Membership` · Arabic `عضوية كالجيم`

### 2.2 The four products
Type the IDs exactly as shown. They can never be changed or reused.

| Reference name | Product ID | Duration | Level | Price (Saudi Arabia, VAT incl.) |
|---|---|---|---|---|
| Pro+ Monthly | `calgym_proplus_monthly` | 1 month | 1 | **SAR 49.99** |
| Pro+ Yearly | `calgym_proplus_yearly` | 1 year | 1 | **SAR 399.99** |
| Pro Monthly | `calgym_pro_monthly` | 1 month | 2 | **SAR 24.99** |
| Pro Yearly | `calgym_pro_yearly` | 1 year | 2 | **SAR 199.99** |

- **Level 1 is the higher tier.** A switch from Pro to Pro+ is then an immediate upgrade, and Pro+ to Pro a downgrade at renewal.
- **Prices:** choose them with **Saudi Arabia** as the base country and let Apple fill in the others. The price is what the customer pays, VAT included.
- **Family Sharing:** off. It can't be turned off once on.
- **Free trials / introductory offers:** none for now. The paywall doesn't explain trial terms yet, and Apple rejects a trial that isn't explained on screen.
- **Availability:** all countries and regions.

**Why these prices.** For every 100 SAR a customer pays, you keep about 63 SAR: VAT 15% is taken off first, then Apple's 15% (with the Small Business Program), then a partner's 15% on sales through their code.

| Plan | Price | You keep | AI cost, typical user (40%) | AI cost, full allowance | Result, typical | Result, full allowance |
|---|---|---|---|---|---|---|
| Pro monthly (150) | 24.99 | 15.70 | ~4.7 | ~8.8 | +11.0 | +6.9 |
| Pro yearly | 199.99 / yr | 10.47 / mo | ~4.7 | ~8.8 | +5.8 | +1.7 |
| Pro+ monthly (400) | 49.99 | 31.41 | ~11.6 | ~26.0 | +19.8 | +5.4 |
| Pro+ yearly | 399.99 / yr | 20.94 / mo | ~11.6 | ~26.0 | +9.3 | −5.1 |

All figures are in SAR per month. AI costs include about 2 SAR of fixed costs per subscriber (server, database, builds). The full-allowance cost assumes the most expensive actions, and Pro+'s more accurate model.

**Break-even per month**, which is what a month of use costs you divided by 0.63:
- **Pro:** 7.5 SAR at typical use, 14 SAR at full use.
- **Pro+:** 18.5 SAR at typical use, 41 SAR at full use.

Only a Pro+ yearly member who uses all 400 actions every month costs more than they pay. Watch **admin → Overview → AI** and the per-user cost in **Users**. Sales without a partner code keep another 15%. If you don't join the Small Business Program, you keep about 52% instead of 63% in the first year, and these prices would need to be about 20% higher.

### 2.3 Localizations (name up to 30 characters, description up to 45)

| Product | English name | English description | Arabic name | Arabic description |
|---|---|---|---|---|
| Pro Monthly | Calgym Pro | 150 AI actions a month and the AI coach | كالجيم برو | ١٥٠ عملية ذكاء اصطناعي شهرياً والمدرب الذكي |
| Pro Yearly | Calgym Pro (Yearly) | 150 AI actions a month and the AI coach | كالجيم برو (سنوي) | ١٥٠ عملية ذكاء اصطناعي شهرياً والمدرب الذكي |
| Pro+ Monthly | Calgym Pro+ | 400 AI actions a month and the AI coach | كالجيم برو+ | ٤٠٠ عملية ذكاء اصطناعي شهرياً والمدرب الذكي |
| Pro+ Yearly | Calgym Pro+ (Yearly) | 400 AI actions a month and the AI coach | كالجيم برو+ (سنوي) | ٤٠٠ عملية ذكاء اصطناعي شهرياً والمدرب الذكي |

If Pro and Pro+ get their own features (under discussion), these descriptions change with them.

### 2.4 Review information (each product)
- **Screenshot:** Profile → Membership. Until the store is live it shows the built-in prices; that's fine.
- **Notes:** "Subscriptions are offered in Profile → Membership and in the membership sheet that opens when a free limit is reached. Restore purchases and the Terms/Privacy links are on the same screens."

The products stay in "Missing Metadata" / "Ready to Submit" until the agreement is active, and go to review together with the first app version that sells them.

---

## 3. ⬜ Keys for RevenueCat (App Store Connect → Users and Access → Integrations)

**In-App Purchase key (required)**
1. **In-App Purchase** → **Generate** → name it `RevenueCat` → **Generate**.
2. **Download the `.p8`.** Apple lets you download it only once.
3. Note the **Key ID** (shown in the list) and the **Issuer ID** (at the top of the page).

**App-Specific Shared Secret (optional)**
- Your app → **App Information** → **App-Specific Shared Secret** → **Manage** → **Generate**.

---

## 4. ⬜ RevenueCat, iPhone (app.revenuecat.com)
1. **Create project:** `Calgym`.
2. **Apps & providers → + App Store app:**
   - Name `Calgym iOS`, bundle ID `com.augaish.calapp`.
   - Upload the `.p8` with its Key ID and Issuer ID; add the shared secret if you made one.
   - Copy the **Apple Server Notification URL** shown there (you need it in section 5).
3. **Product catalog → Products → + New:** the four product IDs.
4. **Entitlements:**
   - `pro` → `calgym_pro_monthly`, `calgym_pro_yearly`
   - `pro_plus` → `calgym_proplus_monthly`, `calgym_proplus_yearly`
5. **Offerings → + New:** identifier `default`, then add four packages and set the offering as **Current**:

   | Package | Identifier | Product |
   |---|---|---|
   | Monthly | `$rc_monthly` | `calgym_pro_monthly` |
   | Annual | `$rc_annual` | `calgym_pro_yearly` |
   | Custom | `proplus_monthly` | `calgym_proplus_monthly` |
   | Custom | `proplus_annual` | `calgym_proplus_yearly` |

   RevenueCat allows only one standard Monthly and one Annual per offering, which is why Pro+ uses custom names. The app reads them from the product IDs.
6. **Project settings → API keys:**
   - Copy the **App Store public key** (`appl_…`).
   - **+ New secret API key**, version **V1**, named `Calgym server` (`sk_…`).
7. **Integrations → Webhooks → + Add:**
   - URL `https://calapp-production-ab20.up.railway.app/api/billing/revenuecat`
   - **Authorization header:** a long random string. To make one, run this in a terminal:
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - Environments: production and sandbox. Events: all.

## 5. ⬜ Apple → RevenueCat notifications
App Store Connect → your app → **App Information** → **App Store Server Notifications**:
- Production URL and Sandbox URL: the Apple Server Notification URL from RevenueCat.
- Version: **2**.

## 6. ⬜ Railway variables

| Variable | Value | Status |
|---|---|---|
| `SUPABASE_URL` | `https://uvhvxcvwpwkqvnvqdtyf.supabase.co` | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_…` | ✅ |
| `SUPPORT_EMAIL` | your support inbox | ✅ |
| `REVENUECAT_IOS_KEY` | `appl_…` | ⬜ |
| `REVENUECAT_SECRET_KEY` | `sk_…` (V1) | ⬜ |
| `REVENUECAT_WEBHOOK_SECRET` | the webhook's Authorization string | ⬜ |
| `REVENUECAT_ANDROID_KEY` | `goog_…` (section 11) | ⬜ later |

Then check **admin → Overview → Launch checklist**. Everything except "First store event received" should be ticked.

## 7. ⬜ Admin page (…/admin)
- **Membership → Membership prices:** Pro `24.99`, Pro+ `49.99`, Pro yearly `199.99`, currency `SAR`. These are only shown until the store is live; after that, the store's own price shows.
- **Membership → Monthly AI allowance:** Free `15`, Pro `150`, Pro+ `400`. A value saved here earlier overrides the new default, so check it.
- **Codes & partners → Promotion codes:** a thank-you code for your testers. For example `FOUNDERS`: free access, Pro, 90 days, max uses = number of testers.
- **Codes & partners → Partners:** add partners and their codes when ready. The shares are explained in `billing-setup.md`.

## 8. ⬜ TestFlight external testing
1. **TestFlight → Test Information:**
   - Beta App Description, feedback email and privacy URL (text in `store-submission.md`).
   - Beta App Review info: your contact details; **Sign-in required: No**.
2. **External Testing → +** → group `Beta testers` → add the newest build → **What to Test** (text in `store-submission.md`) → **Submit for Review**. The first review takes about 24–48 hours.
3. After approval, add testers by email, or turn on the **Public Link**.

## 9. ⬜ App Store listing (App Store Connect → your app → the 1.0 version)
Everything below is ready to paste from [`store-submission.md`](store-submission.md):
- Name, subtitle, promotional text, description (English + Arabic), keywords.
- **Screenshots:** 6.9" (1320 × 2868 or 1290 × 2796), 3–10 per language, from an iPhone Pro Max, in light mode.
- Support URL `/support`, marketing URL (optional), privacy policy URL `/privacy`.
- **App Privacy** label, **age rating**, **App Review notes**, category Health & Fitness.
- Leave "Build" empty until the release build (section 10).

## 10. 🏦 After the bank account (Apple)
1. Wait until the Paid Apps Agreement is **Active**.
2. **Users and Access → Sandbox → Test Accounts** → add a tester, using an email that isn't any Apple ID.
3. On the iPhone: **Settings → Developer → Sandbox Apple Account** → sign in with it. (Turn on Developer Mode if Developer isn't listed.)
4. In the TestFlight build, buy Pro:
   - Profile shows **Pro**.
   - **admin → Overview → Recent store events** shows the purchase.
   - The checklist ticks "First store event received".
5. Test **Restore purchases**, **Pro → Pro+** (should be immediate) and a **free code**.
6. Version 1.0 → **Build**: the newest build; **In-App Purchases and Subscriptions**: add all four → **Submit for Review**.
7. After approval: **Release**, manually or automatically.

---

## 11. Supabase (sign-in)

### 11.1 ⬜ Code email (for autofill)
Supabase → **Authentication → Emails → Magic Link** template: put the code in a plain sentence so iPhone can offer it above the keyboard:
- Subject: `Your Calgym code`
- Body: `Your Calgym code is {{ .Token }}` (and anything else you like around it).

### 11.2 ⬜ Google sign-in
Follow "Google sign-in (one-time setup)" in [`store-submission.md`](store-submission.md#google-sign-in-one-time-setup):
- Google Cloud OAuth client
- Supabase Google provider
- redirect URL `calapp://**`

No app build is needed.

---

## 12. Google Play (company account)

### 12.1 ⬜ Company identity
1. Get the company's **D-U-N-S number** (developer.apple.com/enroll/duns-lookup), with the legal name exactly as on the CR. It usually takes about 5 working days.
2. **play.google.com/console** → create a developer account → **Organization**: legal name, D-U-N-S, company email and phone, $25.
   - Check first whether Google accepts your company type (for example a sole establishment) as an organization.
3. **Payments profile** (business) with the company bank account.

### 12.2 ⬜ The app
1. **Create app:** Calgym, default language, app, free, declarations.
2. **Store listing, Data safety, content rating, target audience (13+), health apps declaration, ads** (Yes only while the sponsor slot is on), **account deletion URL** `/account-deletion`. Answers are in `store-submission.md`.
3. **Release a first build to Internal testing.**
   - Ask me to run the Android **production** build; it makes the `.aab` file Play needs.
   - The first upload sets Play's app signing.
4. Organization accounts don't need the 12-tester, 14-day closed test.

### 12.3 ⬜ Subscriptions (Monetize → Subscriptions)
Same product IDs, each with a base plan: `calgym_pro_monthly` (base plan `monthly`, 1 month), `calgym_pro_yearly` (`yearly`, 1 year), and the same for Pro+. Prices are set per country; the Saudi prices are as above.

### 12.4 ⬜ RevenueCat, Android
1. RevenueCat → **+ Play Store app** → package `com.augaish.calapp`.
2. **Service account credentials:** follow RevenueCat's "Google Play service credentials" guide. You create a service account in Google Cloud, invite it in Play Console → **Users and permissions** with financial and order permissions, and upload its JSON key to RevenueCat.
3. **Real-time developer notifications:** copy the Pub/Sub topic from RevenueCat into Play Console → **Monetization setup**.
4. Add the four Play products in RevenueCat, and attach them to the same entitlements and packages as iPhone.
5. Railway: `REVENUECAT_ANDROID_KEY` = the `goog_…` public key.
6. Play Console → **License testing**: add your Gmail, then buy in the internal-testing build. License testers aren't charged.

### 12.5 🏦 Release
Production → create a release with the newest `.aab` → roll out.

---

## 13. Launch day
- ⬜ Admin checklist is all ticked; the membership pop-up appears for free users once the store sells.
- ⬜ One real purchase on each platform (refund it via Apple / Google if you like).
- ⬜ Partners have their codes and private links.
- ⬜ Send testers the thank-you code.
- ⬜ Watch **admin → Overview** for the first days: purchases, AI failures and AI cost.
