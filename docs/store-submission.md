# Store submission kit

Everything App Store Connect and the Play Console ask for, filled in from what
the app actually does. None of it needs the bank account. Only the paid-apps
agreement and the subscription products do; see `billing-setup.md`.

Server: `https://calapp-production-ab20.up.railway.app`

| What | URL |
|---|---|
| Privacy policy | `/privacy` |
| Terms of use (EULA) | `/terms` |
| Support URL | `/support` |
| Account deletion (Play) | `/account-deletion` |

Before you submit, set these on Railway (the admin page's **Launch checklist** shows what is still missing):
- `SUPPORT_EMAIL`, so the legal pages show a support address rather than a personal one.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, so "Delete my account" also deletes the sign-in account. Both stores require this.

---

## App Store Connect

### App information
- **Name:** Calgym
- **Subtitle (30):** EN `AI calories & workout tracker` · AR `عداد سعرات وتمارين ذكي`
- **Category:** Health & Fitness (secondary: Food & Drink)
- **Content rights:** does not contain third-party content (Open Food Facts data is credited in the privacy policy)

### Promotional text (170)
EN: Snap a meal, log a workout, see your day. Calgym turns photos into calories and macros, keeps your training on plan and shows your progress at a glance.

AR: صوّر وجبتك وسجّل تمرينك وشاهد يومك. يحوّل كالجيم الصور إلى سعرات وعناصر غذائية، ويبقي تمرينك على الخطة، ويعرض تقدمك بلمحة.

### Description
EN:
> Calgym is a calorie and workout tracker that does the typing for you.
>
> FOOD
> • Snap a meal and get calories and macros in seconds, or describe it in words
> • Scan barcodes; read a label when a product isn't found
> • Plan meals and recipes, and see what's left for the day
>
> TRAINING
> • Weekly schedule, one-tap workouts, sets that remember your last session
> • A rest timer on the lock screen, with −15 s, +15 s and Skip
> • Workout history, personal records and progress
>
> HEALTH
> • Weight and body-composition trends; scan an InBody-style report
> • Connect WHOOP for real calorie burn
>
> AI COACH
> • Ask about your nutrition and training; answers use your own numbers
>
> SMART REMINDERS
> • Planned from your own logs: nothing you've already done is reminded
> • Water paced to your goal, a daily recap and a weekly wins summary
> • Buttons right on the notification: add a glass, start your workout, or remind me later
>
> Works as a guest — no account needed. English and Arabic.
>
> Calgym Essentials and Calgym Pro are auto-renewing subscriptions, each starting with a 14-day free trial for new subscribers. Essentials covers Food or Training, plus Health, with 20 AI actions a month. Pro covers Food, Training and Health together, with 50 AI actions a month, the AI program builder and a coach that remembers your documents. Without a subscription you can still view and export everything you recorded. Payment is charged to your Apple ID at confirmation. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the period; manage them in Settings → Apple ID → Subscriptions.
> Terms: https://calapp-production-ab20.up.railway.app/terms · Privacy: https://calapp-production-ab20.up.railway.app/privacy
>
> Calorie and nutrition figures are AI estimates and may be inaccurate. Not medical advice.

AR:
> كالجيم عدّاد سعرات وتمارين يكتب عنك.
>
> الطعام
> • صوّر وجبتك واحصل على السعرات والعناصر الغذائية خلال ثوانٍ، أو صفها بالكلمات
> • امسح الباركود، واقرأ الملصق إن لم يُعثر على المنتج
> • خطط لوجباتك ووصفاتك واعرف المتبقي ليومك
>
> التمرين
> • جدول أسبوعي وتمارين بلمسة، ومجموعات تتذكر جلستك السابقة
> • مؤقت راحة على شاشة القفل مع −١٥ ث و+١٥ ث وتخطٍّ
> • سجل التمارين والأرقام القياسية والتقدم
>
> الصحة
> • اتجاهات الوزن وتركيب الجسم، وقراءة تقارير InBody
> • اربط WHOOP لحرق السعرات الفعلي
>
> المدرب الذكي
> • اسأل عن تغذيتك وتمرينك بإجابات مبنية على أرقامك
>
> تذكيرات ذكية
> • مبنية على ما تسجّله: لا تذكير بشيء أنجزته
> • ماء موزّع على يومك نحو هدفك، وملخص يومي وإنجازات أسبوعية
> • أزرار في الإشعار نفسه: أضف كوب ماء، أو ابدأ تمرينك، أو ذكّرني لاحقاً
>
> يعمل دون حساب، بالعربية والإنجليزية.
>
> كالجيم الأساسيات وكالجيم برو اشتراكات تتجدد تلقائياً، ويبدأ كل منهما بتجربة مجانية لمدة ١٤ يوماً للمشتركين الجدد. الأساسيات تشمل التغذية أو التمارين مع الصحة و٢٠ عملية ذكاء اصطناعي شهرياً. برو يشمل التغذية والتمارين والصحة معاً، مع ٥٠ عملية شهرياً ومصمم البرامج الذكي ومدرب يتذكر ملفاتك. وبدون اشتراك يمكنك الاطلاع على كل ما سجّلته وتصديره. يُخصم المبلغ من حساب Apple عند التأكيد، ويتجدد الاشتراك ما لم يُلغَ قبل ٢٤ ساعة على الأقل من نهاية الفترة، ويُدار من الإعدادات ← Apple ID ← الاشتراكات.
> الشروط: https://calapp-production-ab20.up.railway.app/terms · الخصوصية: https://calapp-production-ab20.up.railway.app/privacy
>
> أرقام السعرات تقديرات بالذكاء الاصطناعي وقد تكون غير دقيقة، وليست نصيحة طبية.

### Keywords (100 characters, comma-separated, no spaces)
EN: `calorie,counter,macro,tracker,diet,meal,food,scanner,workout,gym,fitness,protein,inbody,coach,weight`
AR: `سعرات,حاسبة,رجيم,دايت,وجبات,بروتين,تمارين,جيم,لياقة,وزن,انبادي,تغذية,مدرب,كالوري`

### Age rating
Answer the questionnaire as it applies:
- No violence, sexual content, gambling or contests.
- **Medical or treatment information:** infrequent/mild, because the app gives nutrition estimates, not treatment.
- **Unrestricted web access:** no.
- **User-generated content shared with others:** no.
- **AI chat features:** yes (the AI coach).

The result is usually 12+ or 13+; accept what the questionnaire gives.

### App Privacy ("nutrition label")
Tracking: **No**. No data is used to track people across apps or websites.

| Data type | Collected | Linked to the person | Purpose |
|---|---|---|---|
| Contact info → email address | Yes (accounts only) | Yes | App functionality |
| Health & fitness → fitness, health (weight, body composition, workouts, meals in the account backup) | Yes (accounts only) | Yes | App functionality |
| Purchases → purchase history | Yes | Yes | App functionality |
| Identifiers → user ID (installation / account ID) | Yes | Yes | App functionality |
| Usage data → product interaction (AI action counts, days used) | Yes | Yes | App functionality, analytics |

Photos, report files and coach messages are sent for AI processing and not kept after the answer. Apple doesn't count data processed only in real time and not retained as "collected". Say so in the review notes.

### App Review notes
> • No sign-in needed: tap "Continue as guest" on the first screen. Sign in with Apple, Google and email are also offered.
> • AI features (meal photo, describe a meal, body report scan, AI coach, recipe/program generation) ask permission before anything is sent to our AI providers (Anthropic, DeepSeek). This can be changed in Profile → Privacy → AI processing. Photos and messages are processed in real time and not stored.
> • Account deletion: Profile → Privacy → Delete my account. It deletes on-device data, the cloud backup, the sign-in account and server records. Web: /account-deletion.
> • Subscriptions: Calgym Essentials (Food or Training, plus Health) and Calgym Pro (both), each with a 14-day free trial. They are offered in the membership sheet after onboarding and in Profile → Membership, where Restore purchases, the trial terms and the Terms/Privacy links are shown. Please start the free trial with the sandbox account to reach every feature; without a plan the app shows recorded data read-only.
> • Promo codes: Profile → Redeem a code. Test code: (create one in the admin console, e.g. a 7-day free code, and put it here).
> • Health figures are estimates with a disclaimer; the app gives no medical advice.
> • Notifications are optional and local: they are planned on the device from the person's own logs (no remote push). Their buttons (add water, remind me later, start workout) act inside the app. The background modes (fetch, processing) are used only to re-plan these local reminders a few times a day; the rest timer uses a Live Activity.

### Export compliance
The app only uses standard HTTPS. `ITSAppUsesNonExemptEncryption` is already `false` in `app.json`, so builds won't ask.

### Screenshots (6.9" iPhone required; 6.5" optional)
Suggested order: Overview (today), meal scan result, Training with the schedule, an active workout with the rest timer, Health body composition, AI coach. Take them in light mode, with one Arabic set if you list Arabic.

- **Accepted sizes (portrait):** 1320 × 2868, 1290 × 2796 or 1260 × 2736 pixels.
- A screenshot from an iPhone Pro Max (15, 16 or 17) is already one of these sizes. Smaller iPhones give a size that is rejected.
- Upload 3 to 10 screenshots per language. Apple scales the 6.9" set down for smaller phones.

---

## Google Play Console

- **App category:** Health & Fitness · **Contact email:** the support address · **Privacy policy:** `/privacy`
- **Ads:** answer **Yes** only while the Sponsor slot (admin → Content) is switched on. It is an in-app promotion. Otherwise No.
- **App access:** no login is needed (guest mode). Features beyond viewing need a subscription, which starts with a 14-day free trial; say so in the access instructions, and add a free-access promo code for the reviewer (admin → Codes, e.g. `PLAYREVIEW`, Pro, 30 days) with "Profile → Redeem a code".
- **Subscriptions (Monetize → Subscriptions):** the same product IDs as Apple, each with a base plan (`monthly` / `yearly`) and a `trial14` offer (New customer acquisition, Free trial, 14 days) on the Essentials and Pro base plans. Pro+ is created but not activated.
- **Content rating (IARC):** a reference/utility app with no violence or other flagged content; mention the AI chat when asked.
- **Target audience:** 13+ (not designed for children).
- **Health apps declaration:** select "Nutrition and weight management" and "Activity and fitness". The app is not a medical device.
- **Account deletion:** the app lets users create an account, so answer **Yes**. Web link: `/account-deletion`.
- **Permissions the listing shows:** notifications, camera, microphone (video meal notes), and **"Schedule exact alarms"**. The last is for the rest timer's alert, which must sound when the rest the person started ends. It is the user-grantable `SCHEDULE_EXACT_ALARM`, not the restricted `USE_EXACT_ALARM`, so Play asks for no declaration. If a form asks anyway, answer: "a user-started workout rest timer that alerts when the rest ends".

### Data safety
- **Is data encrypted in transit?** Yes.
- **Can users request deletion?** Yes (in app and via the web link).

| Data type | Collected | Shared | Optional? | Purpose |
|---|---|---|---|---|
| Personal info → email | Yes | No | Optional (accounts) | Account management, app functionality |
| Health and fitness → health info, fitness info | Yes | No | Optional (accounts) | App functionality |
| Financial info → purchase history | Yes | No | Optional | App functionality |
| App activity → app interactions | Yes | No | Required | App functionality, analytics |
| Device or other IDs | Yes | No | Required | App functionality |
| Photos | Processed only (ephemeral) | Sent to the AI providers to answer | Optional | App functionality |
| Messages (coach) | Processed only (ephemeral) | Sent to the AI providers to answer | Optional | App functionality |

On Google's form, sending data to a service provider that processes it on your behalf (the AI providers, RevenueCat) doesn't count as "sharing". Declare the photos and messages as collected with "processed ephemerally" ticked.

---

## Apple, step by step

Do these in order. Only the sandbox purchase test at the end waits for the bank account and the Paid Apps agreement.

### 1. Subscriptions (App Store Connect → your app → Monetization → Subscriptions)

**Subscription group**
- Reference name: `Calgym Membership`
- Localization → display name:
  - English: `Calgym Membership`
  - Arabic: `عضوية كالجيم`

**Products** — all six in the one group. Type the IDs exactly; they can never be changed or reused. You already made the Pro and Pro+ ones; add the two Essentials ones.

| Reference name | Product ID | Duration | Level | Price (Saudi Arabia, VAT incl.) | Sold now |
|---|---|---|---|---|---|
| Pro+ Monthly | `calgym_proplus_monthly` | 1 month | 1 | SAR 49.99 | No, kept for later |
| Pro+ Yearly | `calgym_proplus_yearly` | 1 year | 1 | SAR 399.99 | No, kept for later |
| Pro Monthly | `calgym_pro_monthly` | 1 month | 2 | SAR 24.99 | Yes |
| Pro Yearly | `calgym_pro_yearly` | 1 year | 2 | SAR 199.99 | Yes |
| Essentials Monthly | `calgym_essentials_monthly` | 1 month | 3 | SAR 19.99 | Yes |
| Essentials Yearly | `calgym_essentials_yearly` | 1 year | 3 | SAR 149.99 | Yes |

- **Levels:** 1 is the highest. Essentials → Pro is an immediate upgrade; Pro → Essentials a downgrade at renewal.
- **Essentials is one product for both focuses.** The member picks Food or Training in the app.
- **Pro+:** leave its products as they are, not attached to the app version. They're ready for later.
- **Prices:** set with **Saudi Arabia** as the base country; let Apple fill in the others. The price is what the customer pays, VAT included.
- **Family Sharing:** off (it can't be turned off once on).
- **Free trial, 2 weeks, on the four sold products:** each product → **Subscription Prices → Introductory Offers → +** → countries: all → start: today, no end date → type **Free** → **2 weeks**. The app shows the trial and its terms only to people Apple says are still eligible, and reminds them two days before the first charge.
- **Availability:** all countries and regions.

**Localizations** (display name up to 30 characters, description up to 45)

| Product | English name | English description | Arabic name | Arabic description |
|---|---|---|---|---|
| Essentials Monthly | Calgym Essentials | Food or Training plus Health, 20 AI a month | كالجيم الأساسيات | التغذية أو التمارين مع الصحة، ٢٠ عملية شهرياً |
| Essentials Yearly | Calgym Essentials (Yearly) | Food or Training plus Health, 20 AI a month | كالجيم الأساسيات (سنوي) | التغذية أو التمارين مع الصحة، ٢٠ عملية شهرياً |
| Pro Monthly | Calgym Pro | Food, Training and Health, 50 AI a month | كالجيم برو | التغذية والتمارين والصحة، ٥٠ عملية شهرياً |
| Pro Yearly | Calgym Pro (Yearly) | Food, Training and Health, 50 AI a month | كالجيم برو (سنوي) | التغذية والتمارين والصحة، ٥٠ عملية شهرياً |

Pro+ keeps what you already entered; it isn't reviewed until it's sold. Pricing and break-even math are in [step-by-step.md](step-by-step.md), section 2.

**Review information (each product)**
- **Screenshot:** the membership sheet or Profile → Membership. Until the store is live, it shows the built-in prices; that's fine for review.
- **Review notes:** "Calgym is a subscription app with a 14-day free trial. Plans are offered in the membership sheet after onboarding and in Profile → Membership: Essentials (Food or Training) and Pro (both). Without a plan, a person can still view and export everything they recorded. Restore purchases and the Terms/Privacy links are on the same screens."

The products stay in "Missing Metadata" or "Ready to Submit" until the Paid Apps agreement is active. That's expected. They're submitted for review together with the first app version that sells them.

### 2. Keys RevenueCat needs (App Store Connect → Users and Access → Integrations)

**In-App Purchase key (required)**
1. **In-App Purchase** → **+** (Generate) → name it `RevenueCat` → **Generate**.
2. **Download** the `.p8` file. Apple lets you download it **only once**, so keep it somewhere safe.
3. Note the **Key ID** (shown in the list) and the **Issuer ID** (shown at the top of the page).

**App-Specific Shared Secret (optional; RevenueCat asks for it for older receipts)**
- Your app → **App Information** → **App-Specific Shared Secret** → **Manage** → **Generate**, then copy it.

### 3. RevenueCat (app.revenuecat.com)

1. **Create project:** `Calgym`.
2. **Apps & providers → + App Store app:**
   - App name `Calgym iOS`, bundle ID `com.augaish.calapp`.
   - Upload the In-App Purchase key `.p8`, with its Key ID and Issuer ID.
   - Paste the App-Specific Shared Secret if you made one. Save.
   - Copy the **Apple Server Notification URL** shown on this page; you need it in step 4.
3. **Product catalog → Products → + New:** add all six product IDs from the table, one at a time, under the App Store app (the Pro+ ones too, so a Pro+ purchase would still be recognised later).
4. **Product catalog → Entitlements:**
   - `essentials` (description "Essentials"): attach `calgym_essentials_monthly` and `calgym_essentials_yearly`.
   - `pro` (description "Pro"): attach `calgym_pro_monthly` and `calgym_pro_yearly`.
   - `pro_plus` (description "Pro+"): attach `calgym_proplus_monthly` and `calgym_proplus_yearly`.
5. **Product catalog → Offerings → + New:** identifier `default`, description "Standard". Add four packages:

   | Package | Identifier | Product |
   |---|---|---|
   | Monthly | `$rc_monthly` | `calgym_pro_monthly` |
   | Annual | `$rc_annual` | `calgym_pro_yearly` |
   | Custom | `essentials_monthly` | `calgym_essentials_monthly` |
   | Custom | `essentials_annual` | `calgym_essentials_yearly` |

   Then make `default` the **Current** offering. The app sorts packages by product ID, so the custom names work; RevenueCat allows only one standard Monthly and one Annual per offering. **Don't add Pro+ packages** — leaving them out is what keeps Pro+ off the paywall. If you already added them, remove them from the offering (the products and entitlement stay).
6. **Project settings → API keys:**
   - Copy the **App Store public key**, which starts with `appl_`.
   - **+ New secret API key**, version **V1**, named `Calgym server`. Copy it; it starts with `sk_`.
7. **Integrations → Webhooks → + Add:**
   - URL: `https://calapp-production-ab20.up.railway.app/api/billing/revenuecat`
   - **Authorization header:** a long random string. To make one, run this in the VS Code terminal:
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - Environment: production and sandbox. Events: all. Save.

### 4. Apple → RevenueCat notifications
App Store Connect → your app → **App Information** → **App Store Server Notifications**:
- **Production** and **Sandbox** URLs: the Apple Server Notification URL copied from RevenueCat.
- Version: **2**.

### 5. Railway (server → Variables)

| Variable | Value |
|---|---|
| `REVENUECAT_IOS_KEY` | the `appl_…` public key |
| `REVENUECAT_SECRET_KEY` | the `sk_…` V1 secret key |
| `REVENUECAT_WEBHOOK_SECRET` | the same random string as the webhook's Authorization header |

After it redeploys, open **admin → Overview → Launch checklist**. The three RevenueCat rows should be ticked. "First store event received" ticks after the first sandbox purchase.

### 6. TestFlight external testing (App Store Connect → TestFlight)

**Test Information** (left sidebar), filled in once:
- **Beta App Description:** "Calgym is a calorie and workout tracker. Snap a meal for calories and macros, follow your weekly training with a rest timer, and track weight and body composition. Please try logging a meal, a workout and a body reading, and tell us what felt slow or unclear."
- **Feedback email:** your support address. **Privacy Policy URL:** `/privacy` on the server.
- **Beta App Review information:** your name, phone and email.
  - **Sign-in required:** No. Guest mode needs no account.
  - **Notes:** the same as the App Review notes above.

**External group**
1. **External Testing → +** → group name `Beta testers`.
2. **Builds → +** → the newest build (the one started on 28 September, see the end of this section).
3. **What to Test:** "Log meals by photo or text, run a workout from Training (watch the rest timer on the lock screen), try the AI coach, and switch Arabic/English in Profile. Leave notifications on for a day: reminders only for what you haven't logged, an evening recap, and buttons to add water or start a workout."
4. **Submit for Review.** The first external build usually takes 24–48 hours; later builds are often approved automatically.
5. After approval, add testers by email, or turn on the **Public Link** (up to 10,000 testers) and share it.

### 7. After the bank account
1. App Store Connect → **Business** → add the bank account. Wait for **Paid Apps Agreement: Active** (up to a day or two).
2. **Users and Access → Sandbox → Test Accounts** → add a tester with an email not used for any Apple ID.
3. On your iPhone: **Settings → Developer → Sandbox Apple Account** → sign in with it. Enable Developer Mode if it isn't showing.
4. In the TestFlight build, choose **Training** on the paywall and start the Essentials trial → Profile shows "Essentials · Training" and "Free trial · ends …" → the admin shows the purchase. Then upgrade to Pro from Profile → Membership.
5. Admin → Membership → turn **Plan locks** on (after testers have the `FOUNDERS` code).
6. Submit the app version with the four Essentials and Pro subscriptions attached for App Review.

### Native changes in builds since 11
- Build 15: the lock-screen and Dynamic Island rest countdown (the LiveActivity extension), and dark mode "System".
- Build 16: the larger lock-screen countdown layout, with the time first, big and clear.
- Android APK `28587322`: the first Android lock-screen countdown (a silent notification).
- **iOS build and Android APK started 28 September evening (Phase 3). These are the builds to test and submit:**
  - Background refresh: planned reminders stay accurate on days the app isn't opened. This adds the `fetch` and `processing` background modes.
  - Notification buttons work with the app closed: "+ your glass" of water, "In 30 min" or "In 1 hour", "Log meal" and "Start workout".
  - Android: the rest countdown shows on the lock screen, with −15 s, +15 s and Skip. When the rest ends, it turns into the "Rest over" alert with sound, exactly on time. On Android 14+, allow **Profile → Notifications → Allow exact rest alerts** once.
  - The iOS build number is set automatically: the next after 16. It uploads to TestFlight by itself in about 30–40 minutes.
- Everything else (plans, Essentials, trial, notification planning, tap-to-open, the in-app ±15 s) also arrives over the air on older builds.

### Test these on the new builds
1. **Rest timer, Android:**
   - Complete a set, then lock the phone. The countdown is on the lock screen.
   - Tap +15 s: the time jumps. Open the app: the session shows the same time.
   - Tap Skip: the notification goes, and the app shows no rest.
   - Let a rest finish with the phone locked: the same notification becomes "Rest over", with sound.
2. **Rest timer, iPhone:** the lock-screen and Dynamic Island countdown as before. The "Rest over" alert still arrives with the phone locked.
3. **Notification buttons** (long-press a notification on iPhone, or expand it on Android):
   - Water "+250 ml" adds a glass without opening the app. The next water reminder counts it.
   - "In 30 min" brings the meal reminder back 30 minutes later, unless you log the meal first.
   - "Start workout" opens today's workout, already started.
4. **Taps:** a water reminder opens Water, a meal reminder opens Food, the recap opens Overview.
5. **Profile → Notifications → Coming up:** shows the plan, and after a "Later" it shows the moved reminder.

---

## Apple Small Business Program (15% commission)
Apply at developer.apple.com/app-store/small-business-program → **Enroll**, signed in as the Account Holder (Team ID `ZV34R3L8FY`).

| Question | Answer |
|---|---|
| Paid Applications Agreement accepted? | **Yes**, once App Store Connect → Business shows it **Active**. Accept it first if it doesn't. |
| Majority interest in another developer account? | **No** |
| Another account has majority interest in yours? | **No** |
| Decision-making authority over another account? | **No** |
| Another account has authority over yours? | **No** |
| Associated Developer Account Details | Nothing to fill: the section only applies after a "Yes". If it still asks for one, recheck the four answers. Never list your own account there. |

Apple confirms by email. The 15% rate starts at the beginning of the next Apple fiscal month after approval.

---

## Google sign-in (one-time setup)
The app's "Continue with Google" button goes through Supabase Auth. Until the steps below are done, tapping it says Google sign-in isn't ready yet.

1. **Google Cloud Console** (console.cloud.google.com) → create a project named **Calgym**.
2. **APIs & Services → OAuth consent screen:**
   - User type **External**, app name **Calgym**, support email, and the app logo if you want it.
   - Authorized domain: `supabase.co`.
   - Scopes: `email`, `profile`, `openid`.
   - Then **Publish app**. While it's in "Testing", only listed test users can sign in.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID:**
   - Type **Web application**, name "Calgym Supabase".
   - Authorized redirect URI: `https://uvhvxcvwpwkqvnvqdtyf.supabase.co/auth/v1/callback`
   - Copy the **Client ID** and **Client secret**.
4. **Supabase → Authentication → Sign In / Providers → Google:** enable it, paste the Client ID and Client secret, and save.
5. **Supabase → Authentication → URL Configuration → Redirect URLs:** add `calapp://**`.

No app build is needed: the button works on build 15 as soon as step 5 is saved.
Google's page will say "to continue to uvhvxcvwpwkqvnvqdtyf.supabase.co". Showing "Calgym" there instead needs a Supabase custom domain, which is a paid add-on.
