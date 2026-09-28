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

### 2.2 The products
Type the IDs exactly as shown. They can never be changed or reused. You already created the four Pro and Pro+ products; **add the two Essentials ones**.

| Reference name | Product ID | Duration | Level | Price (Saudi Arabia, VAT incl.) | Sold at launch |
|---|---|---|---|---|---|
| Pro+ Monthly | `calgym_proplus_monthly` | 1 month | 1 | SAR 49.99 | No, kept for later |
| Pro+ Yearly | `calgym_proplus_yearly` | 1 year | 1 | SAR 399.99 | No, kept for later |
| Pro Monthly | `calgym_pro_monthly` | 1 month | 2 | **SAR 24.99** | Yes |
| Pro Yearly | `calgym_pro_yearly` | 1 year | 2 | **SAR 199.99** | Yes |
| Essentials Monthly | `calgym_essentials_monthly` | 1 month | 3 | **SAR 19.99** | Yes |
| Essentials Yearly | `calgym_essentials_yearly` | 1 year | 3 | **SAR 149.99** | Yes |

- **All six in the one group.** Level 1 is the highest: Essentials → Pro is an immediate upgrade, Pro → Essentials a downgrade at renewal.
- **Pro+ stays unsold.** Leave its two products as they are (not attached to the app version, not in RevenueCat's offering). They're ready when Pro+ has its own reason to exist.
- **Essentials is one product for both focuses.** The member picks Food or Training in the app; the store only sells "Essentials".
- **Prices:** choose them with **Saudi Arabia** as the base country and let Apple fill in the others. The price is what the customer pays, VAT included.
- **Family Sharing:** off. It can't be turned off once on.
- **Free trial, 2 weeks, on all four sold products** (Essentials and Pro, monthly and yearly): each product → **Subscription Prices → Introductory Offers → +** → countries: all → start date: today, no end date → type **Free** → duration **2 weeks**.
  - Apple allows one trial per Apple ID per group, and the app shows "14 days free, then … , cancel at least 24 hours before" only to people Apple says are still eligible.
  - **Every trial is Pro:** whichever plan someone starts, the two weeks include everything (Food, Training, Health, the program builder, coach memory), with the trial allowance (at most 50 AI actions; admin → Membership → Free trial). At the first charge it becomes the plan they chose.
  - Someone on the Pro trial who wants the cheaper plan picks Essentials in Profile → Membership: the store switches them when the trial ends, with no charge before then. An upgrade after paying is immediate, and the store credits the unused part (Google Play is set to charge only the difference).
  - The app reminds the member two days before the first charge.
  - Partners earn nothing on the trial itself, only from the first paid renewal.
- **Availability:** all countries and regions.

**Why these prices.** For every 100 SAR a customer pays, you keep about 63 SAR: VAT 15% is taken off first, then Apple's 15% (with the Small Business Program), then a partner's 15% on sales through their code.

| Plan | Price | You keep | AI cost, typical | AI cost, full allowance | Result, typical | Result, full allowance |
|---|---|---|---|---|---|---|
| Essentials monthly (20) | 19.99 | 12.56 | ~0.4 | ~0.9 | +12.2 | +11.7 |
| Essentials yearly | 149.99 / yr | 7.85 / mo | ~0.4 | ~0.9 | +7.5 | +7.0 |
| Pro monthly (50) | 24.99 | 15.70 | ~0.9 | ~2.3 | +14.8 | +13.4 |
| Pro yearly | 199.99 / yr | 10.47 / mo | ~0.9 | ~2.3 | +9.6 | +8.2 |

All figures are in SAR per member per month. AI costs about 0.045 SAR an action. Fixed costs are counted separately below.

**How many subscribers you need.** Fixed costs are roughly **430 SAR a month**:

| Cost | SAR / month |
|---|---|
| Apple Developer ($99 a year) | 31 |
| Railway server and database | ~75 |
| Supabase paid plan (free until you grow) | ~94 |
| Expo builds and updates, paid plan (free until about 1,000 active users) | ~71 |
| Your own Claude / ChatGPT subscriptions (assumed) | ~150 |
| Domain and email | ~5 |

Divided by what an average subscriber leaves after costs (about 13.7 SAR with the Small Business Program and half the sales through partners; about 9.1 SAR in the worst case, with Apple at 30%, every sale through a partner and full AI use):

| Advertising a month | Subscribers to break even (realistic) | (worst case) |
|---|---|---|
| None | ~32 | ~48 |
| 1,000 SAR | ~105 | ~158 |
| 3,000 SAR | ~251 | ~379 |

Watch **admin → Overview** for the real mix. If you advertise, what matters is the payback: what one subscriber costs to win divided by the ~13.7 SAR they leave each month.

### 2.3 Localizations (name up to 30 characters, description up to 45)

| Product | English name | English description | Arabic name | Arabic description |
|---|---|---|---|---|
| Essentials Monthly | Calgym Essentials | Food or Training plus Health, 20 AI a month | كالجيم الأساسيات | التغذية أو التمارين مع الصحة، ٢٠ عملية شهرياً |
| Essentials Yearly | Calgym Essentials (Yearly) | Food or Training plus Health, 20 AI a month | كالجيم الأساسيات (سنوي) | التغذية أو التمارين مع الصحة، ٢٠ عملية شهرياً |
| Pro Monthly | Calgym Pro | Food, Training and Health, 50 AI a month | كالجيم برو | التغذية والتمارين والصحة، ٥٠ عملية شهرياً |
| Pro Yearly | Calgym Pro (Yearly) | Food, Training and Health, 50 AI a month | كالجيم برو (سنوي) | التغذية والتمارين والصحة، ٥٠ عملية شهرياً |

Pro+ keeps what you already entered; it isn't reviewed until it's sold.

### 2.4 Review information (each product)
- **Screenshot:** Profile → Membership. Until the store is live it shows the built-in prices; that's fine.
- **Notes:** "Calgym is a subscription app with a 14-day free trial. Plans are offered in the membership sheet after onboarding and in Profile → Membership: Essentials (Food or Training) and Pro (both). Without a plan, a person can still view and export everything they recorded. Restore purchases and the Terms/Privacy links are on the same screens."

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
3. **Product catalog → Products → + New:** the six product IDs (the Pro+ ones too, so a Pro+ purchase would still be recognised later).
4. **Entitlements:**
   - `essentials` → `calgym_essentials_monthly`, `calgym_essentials_yearly`
   - `pro` → `calgym_pro_monthly`, `calgym_pro_yearly`
   - `pro_plus` → `calgym_proplus_monthly`, `calgym_proplus_yearly`
5. **Offerings → + New:** identifier `default`, then add these four packages and set the offering as **Current**:

   | Package | Identifier | Product |
   |---|---|---|
   | Monthly | `$rc_monthly` | `calgym_pro_monthly` |
   | Annual | `$rc_annual` | `calgym_pro_yearly` |
   | Custom | `essentials_monthly` | `calgym_essentials_monthly` |
   | Custom | `essentials_annual` | `calgym_essentials_yearly` |

   RevenueCat allows only one standard Monthly and one Annual per offering, which is why Essentials uses custom names; the app reads the plan from the product IDs. **Don't add the Pro+ packages** — that's what keeps Pro+ off the paywall. If you already added them, remove them from the offering (the products and entitlement stay).
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
- **Membership → Membership prices:** Essentials `19.99` / year `149.99`, Pro `24.99` / year `199.99`, currency `SAR` (Pro+ `49.99` stays for later). These are only shown until the store is live; after that, the store's own price shows.
- **Membership → Monthly AI allowance:** Free (locks off) `7`, Essentials `20`, Pro `50`, Pro+ `400`, Free trial `50`. A value saved here earlier overrides the new default, so check it.
- **Codes & partners → Promotion codes:** a thank-you code for your testers: `FOUNDERS`, free access, **Pro**, 90 days, max uses = number of testers. Send it to them before you turn plan locks on.
- **Users → Grant a plan:** you can also give someone Essentials · Food, Essentials · Training or Pro directly (for example a tester who wants to try Essentials).
- **Membership → Plan locks:** this switches the launch offer on. Leave it **off** until the store can sell (section 10); while off, everyone can use everything as today. Once on:
  - **No plan:** view and export only; no new logging and no AI.
  - **Essentials:** the chosen module (Food or Training) plus Health, 20 AI actions. The other module's tab stays visible, read-only, with an upgrade banner; its AI is refused by the server, and the coach still answers general questions but won't log or plan for it. Focus can change once every 30 days.
  - **Pro:** everything, 50 AI actions, the program builder (1 a month) and coach memory.
  - Nothing anyone recorded is ever deleted, whatever the plan.
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
Same product IDs, each with a base plan: `calgym_essentials_monthly` (base plan `monthly`, 1 month), `calgym_essentials_yearly` (`yearly`, 1 year), and the same for Pro (and Pro+, created but not sold). Prices are set per country; the Saudi prices are as above.
For the free trial, on each **Essentials and Pro** base plan: **Add offer** → offer ID `trial14` → eligibility **New customer acquisition** → phase **Free trial, 14 days** → activate. Google only shows it to people who can take it. In RevenueCat's Android app, add the same entitlements and put the Essentials and Pro base plans in the `default` offering like on iPhone.

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
- ⬜ Send testers the `FOUNDERS` code, then turn **Plan locks** on in the admin page.
- ⬜ With a Sandbox Apple ID that has never subscribed, check the paywall: Food / Training / Both, "14 days free", the terms above the button, and that choosing Essentials · Training shows only Training on Overview.
- ⬜ Check the free trial appears on the yearly plans (use a Sandbox Apple ID that has never subscribed).
- ⬜ Watch **admin → Overview** for the first days: purchases, AI failures and AI cost.
