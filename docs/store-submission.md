# Calgym store submission, step by step

Do the steps **in order**. Each step says **where** to go, **what** to do,
and how you know it's **done**. Everything to paste is written inside the
step itself.

- ⬜ = to do.
- 🏦 = waits until the bank account and the Paid Apps agreement are active.

Your details, used below:

| | |
|---|---|
| Server | `https://calapp-production-ab20.up.railway.app` |
| Privacy policy | `https://calapp-production-ab20.up.railway.app/privacy` |
| Terms of use | `https://calapp-production-ab20.up.railway.app/terms` |
| Support page | `https://calapp-production-ab20.up.railway.app/support` |
| Account deletion page | `https://calapp-production-ab20.up.railway.app/account-deletion` |
| Admin page | `https://calapp-production-ab20.up.railway.app/admin` |
| Bundle ID / package | `com.augaish.calapp` |
| Apple Team ID | `ZV34R3L8FY` |

---

# Part A — Apple (App Store)

## Step 1 ⬜ Check the newest build reached TestFlight
1. Open **appstoreconnect.apple.com → Apps → Calgym → TestFlight**.
2. Under **iOS builds**, look for **build 17** (version 1.0.0), uploaded on the evening of 28 September.
3. If it shows **Missing Compliance**, click it and choose **None of the algorithms mentioned**. Normally it won't ask, because the app declares no special encryption.

**Done when:** the build shows **Ready to Test** (it can take 30–60 minutes after upload).

## Step 2 ⬜ Test the new build on your iPhone
1. Install it from the **TestFlight** app.
2. Try these:
   - Complete a set and lock the phone: the rest countdown is on the lock screen, and "Rest over" arrives when it ends.
   - **Profile → Notifications:** "Coming up" lists your planned reminders.
   - When a water reminder arrives, long-press it and tap **+250 ml**: the water is added without opening the app.
   - Tap a meal reminder: it opens Food.

**Done when:** all four work. If one doesn't, tell me what you saw.

## Step 3 ⬜ Agreements, tax and bank
1. App Store Connect → **Business** (top menu; called "Agreements, Tax, and Banking" on older screens).
2. **Paid Apps** agreement → **View and Agree to Terms** → accept.
3. **Tax Forms:** fill in the **U.S. Form W-8BEN** (as an individual outside the US), then any local tax form it asks for.
4. 🏦 **Bank Account:** add the account the money goes to.

**Done when:** Paid Apps shows **Active**. It can take a day or two after the bank account is added. You can continue with steps 5–12 meanwhile.

## Step 4 ⬜ Small Business Program (15% instead of 30%)
Do this once the Paid Apps agreement is accepted.

1. Go to **developer.apple.com/app-store/small-business-program** → **Enroll**, signed in as the account holder.
2. Answer like this:

| Question | Answer |
|---|---|
| Have you accepted the latest Paid Applications Agreement? | **Yes, I have accepted** |
| Do you have majority interest in another developer account? | **No** |
| Does another developer account have majority interest in yours? | **No** |
| Do you have decision-making authority over another account? | **No** |
| Does another account have decision-making authority over yours? | **No** |
| Associated Developer Account Details | **Leave empty.** It disappears when all four answers are No. If it still shows, one answer is still Yes. Never type your own account there. |

3. Tick the confirmations → **Submit**.

**Done when:** you get Apple's confirmation email. The 15% rate starts at the beginning of the next Apple fiscal month.

## Step 5 ⬜ Create the subscriptions
**Where:** App Store Connect → **Apps → Calgym → Monetization → Subscriptions**.

**5.1 Subscription group** (you may already have it)
1. Click **+** next to Subscription Groups. Reference name: `Calgym Membership`.
2. In the group → **App Store Localization → +**:
   - English: display name `Calgym Membership`
   - Arabic: display name `عضوية كالجيم`

**5.2 Products.** Pro and Pro+ exist already; add the two Essentials products. In the group → **+** (Create), then for each:

| Reference name | Product ID (type exactly) | Duration | Price (base country Saudi Arabia) |
|---|---|---|---|
| Essentials Monthly | `calgym_essentials_monthly` | 1 Month | SAR 19.99 |
| Essentials Yearly | `calgym_essentials_yearly` | 1 Year | SAR 149.99 |
| Pro Monthly *(exists)* | `calgym_pro_monthly` | 1 Month | SAR 24.99 |
| Pro Yearly *(exists)* | `calgym_pro_yearly` | 1 Year | SAR 199.99 |
| Pro+ Monthly *(exists, not sold yet)* | `calgym_proplus_monthly` | 1 Month | SAR 49.99 |
| Pro+ Yearly *(exists, not sold yet)* | `calgym_proplus_yearly` | 1 Year | SAR 399.99 |

For each **sold** product (the four Essentials and Pro ones):
1. **Availability:** all countries and regions.
2. **Subscription Prices → Add Subscription Price:**
   - Country **Saudi Arabia**, then the price in the table. Let Apple fill in the other countries.
   - The price is what the customer pays, VAT included.
3. **Introductory Offers → +:**
   - Countries: all.
   - Start: today, no end date.
   - Type **Free**, duration **2 Weeks** → Confirm.
4. **Family Sharing:** leave **off**. Once on, it can't be turned off.

**5.3 Order (levels).** In the group, **Edit Subscription Levels**. Drag the six into this order, where 1 is the highest:

| Level | Product |
|---|---|
| 1 | Pro+ Yearly |
| 2 | Pro+ Monthly |
| 3 | Pro Yearly |
| 4 | Pro Monthly |
| 5 | Essentials Yearly |
| 6 | Essentials Monthly |

With this order:
- **Moving up** (Essentials → Pro, or monthly → yearly) happens at once, and Apple refunds the unused part of the old plan.
- **Moving down** (Pro → Essentials, or yearly → monthly) happens when the current period or trial ends.

**5.4 Localizations.** In each sold product → **App Store Localization → +**:

| Product | English name | English description | Arabic name | Arabic description |
|---|---|---|---|---|
| Essentials Monthly | `Calgym Essentials` | `Food or Training plus Health, 20 AI a month` | `كالجيم الأساسيات` | `التغذية أو التمارين مع الصحة، ٢٠ عملية شهرياً` |
| Essentials Yearly | `Calgym Essentials (Yearly)` | `Food or Training plus Health, 20 AI a month` | `كالجيم الأساسيات (سنوي)` | `التغذية أو التمارين مع الصحة، ٢٠ عملية شهرياً` |
| Pro Monthly | `Calgym Pro` | `Food, Training and Health, 50 AI a month` | `كالجيم برو` | `التغذية والتمارين والصحة، ٥٠ عملية شهرياً` |
| Pro Yearly | `Calgym Pro (Yearly)` | `Food, Training and Health, 50 AI a month` | `كالجيم برو (سنوي)` | `التغذية والتمارين والصحة، ٥٠ عملية شهرياً` |

**5.5 Review Information.** In each sold product, at the bottom:
- **Screenshot:** upload the one made for that product. They are in the repository, in `docs/review-screenshots/`, at 1290 × 2796:

  | Product | File |
  |---|---|
  | Essentials Monthly | `essentials-monthly.png` |
  | Essentials Yearly | `essentials-yearly.png` |
  | Pro Monthly | `pro-monthly.png` |
  | Pro Yearly | `pro-yearly.png` |
- **Review Notes:** paste
  > Calgym is a subscription app with a 14-day free trial that includes every feature, whichever plan follows it. Plans are offered in the membership sheet after onboarding and in Profile → Membership: Essentials (Food or Training) and Pro (both). Without a plan, a person can still view and export everything they recorded. Restore purchases and the Terms/Privacy links are on the same screens.

**Done when:** the four sold products show **Ready to Submit**. Until the Paid Apps agreement is active they may show "Missing Metadata"; that's normal. Leave Pro+ alone.

## Step 6 ⬜ Make the key RevenueCat needs
**Where:** App Store Connect → **Users and Access → Integrations → In-App Purchase**.
1. **Generate API Key** (or **+**) → name `RevenueCat` → **Generate**.
2. **Download** the `.p8` file. Apple lets you download it **only once**, so keep it safe.
3. Write down the **Key ID** (in the list) and the **Issuer ID** (top of the page).
4. Optional: your app → **App Information → App-Specific Shared Secret → Manage → Generate**. Copy it.

**Done when:** you have the `.p8` file, the Key ID and the Issuer ID.

## Step 7 ⬜ RevenueCat
**Where:** app.revenuecat.com.
1. **Create project** `Calgym` (skip if it exists).
2. **Apps & providers → + App Store app:**
   - App name `Calgym iOS`, bundle ID `com.augaish.calapp`.
   - Upload the `.p8`, with the Key ID and Issuer ID. Add the shared secret if you made one.
   - **Save**.
   - Copy the **Apple Server Notification URL** shown on that page; step 8 needs it.
3. **Product catalog → Products → + New:** add all six product IDs from step 5.2, one at a time.
4. **Product catalog → Entitlements → + New:**
   - `essentials`: attach `calgym_essentials_monthly` and `calgym_essentials_yearly`.
   - `pro`: attach `calgym_pro_monthly` and `calgym_pro_yearly`.
   - `pro_plus`: attach `calgym_proplus_monthly` and `calgym_proplus_yearly`.
5. **Product catalog → Offerings → + New:** identifier `default`, description `Standard`. Inside it, add four packages:

   | Package type | Identifier | Product |
   |---|---|---|
   | Monthly | `$rc_monthly` | `calgym_pro_monthly` |
   | Annual | `$rc_annual` | `calgym_pro_yearly` |
   | Custom | `essentials_monthly` | `calgym_essentials_monthly` |
   | Custom | `essentials_annual` | `calgym_essentials_yearly` |

   Then click **Make current** on `default`. Do **not** add Pro+ packages; leaving them out keeps Pro+ off the paywall.
6. **Project settings → API keys:**
   - Copy the **App Store public key** (starts with `appl_`).
   - **+ New secret API key**, version **V1**, name `Calgym server`. Copy it (starts with `sk_`).
7. **Integrations → Webhooks → + Add:**
   - URL: `https://calapp-production-ab20.up.railway.app/api/billing/revenuecat`
   - **Authorization header:** a long random string. To make one, run this in the VS Code terminal and copy the result:
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - Environment: **Production and Sandbox**. Events: **all**. **Save**.

**Done when:** you have the `appl_` key, the `sk_` key and the random string.

## Step 8 ⬜ Apple → RevenueCat notifications
**Where:** App Store Connect → your app → **App Information → App Store Server Notifications**.
1. **Production Server URL:** paste the Apple Server Notification URL from step 7.2.
2. **Sandbox Server URL:** the same URL.
3. Version: **Version 2**. **Save**.

## Step 9 ⬜ Railway variables
**Where:** railway.app → the Calgym server → **Variables**. Add:

| Variable | Value |
|---|---|
| `REVENUECAT_IOS_KEY` | the `appl_…` key |
| `REVENUECAT_SECRET_KEY` | the `sk_…` key |
| `REVENUECAT_WEBHOOK_SECRET` | the random string from step 7.7 |

Check these are already there: `SUPPORT_EMAIL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

**Done when:** Railway has redeployed and **admin → Overview → Launch checklist** ticks the three RevenueCat rows. "First store event received" ticks later, in step 16.

## Step 10 ⬜ Admin page
**Where:** `https://calapp-production-ab20.up.railway.app/admin`.
1. **Membership → Membership prices:** Essentials `19.99`, Essentials yearly `149.99`, Pro `24.99`, Pro yearly `199.99`, currency `SAR`. Save.
2. **Membership → Monthly AI allowance:** Free `7`, Essentials `20`, Pro `50`, Pro+ `400`, Free trial `50`. Save.
3. **Codes & partners → Promotion codes → New:**
   - `FOUNDERS`: free access, **Pro**, 90 days, max uses = your number of testers. This is for your testers.
   - `APPREVIEW`: free access, **Pro**, 30 days, max uses 10. This is for Apple's and Google's reviewers.
4. **Membership → Plan locks:** leave **OFF** for now. It's switched on in step 18.

## Step 11 ⬜ App information
**Where:** App Store Connect → your app → **App Information** (left sidebar).
1. **Name:** `Calgym`.
2. **Subtitle:**
   - English: `AI calories & workout tracker`
   - Arabic: add the Arabic localization with the language menu (top right), then `عداد سعرات وتمارين ذكي`
3. **Category:** primary **Health & Fitness**, secondary **Food & Drink**.
4. **Content Rights:** "No, it does not contain, show, or access third-party content."
5. **Age Rating → Edit.** Answer:
   - Violence, sexual content, gambling, contests: **None** or **No**.
   - Medical or treatment information: **Infrequent/Mild**.
   - Unrestricted web access: **No**.
   - User-generated content: **No**.
   - AI chatbot or AI features: **Yes**.

   Accept the rating it gives (usually 12+ or 13+).
6. **Save.**

## Step 12 ⬜ Pricing, availability and App Privacy
1. **Pricing and Availability:**
   - Price **Free**. The subscriptions are sold inside the app.
   - Availability: all countries (or the ones you want).
2. **App Privacy → Privacy Policy URL:** `https://calapp-production-ab20.up.railway.app/privacy`
3. **App Privacy → Get Started / Edit:**
   - "Do you or your third-party partners collect data?" **Yes**.
   - Tick exactly these, and for each answer **Linked to the user: Yes**, **Used for tracking: No**:

   | Tick | Purpose to choose |
   |---|---|
   | Contact Info → **Email Address** | App Functionality |
   | Health & Fitness → **Health** | App Functionality |
   | Health & Fitness → **Fitness** | App Functionality |
   | Purchases → **Purchase History** | App Functionality |
   | Identifiers → **User ID** | App Functionality |
   | Usage Data → **Product Interaction** | App Functionality, Analytics |

   - Don't tick Photos or Messages. They are processed for the answer and not kept, which Apple doesn't count as collected. The review notes in step 13 say so.
4. **Publish** the privacy answers.

## Step 13 ⬜ The version page (1.0)
**Where:** your app → **iOS App → 1.0 Prepare for Submission**. Fill in the English page, then switch the language menu to Arabic and fill in the Arabic page.

**13.1 Screenshots** (3–10 per language)
- Take them on an iPhone Pro Max (15, 16 or 17) in light mode. Accepted sizes: 1320 × 2868, 1290 × 2796 or 1260 × 2736.
- Suggested order:
  1. Overview (today)
  2. A meal scan result
  3. Training with the schedule
  4. A workout with the rest timer
  5. Health body composition
  6. The AI coach
- Drag them into **iPhone 6.9" Display**.

**13.2 Promotional Text**
- EN: `Snap a meal, log a workout, see your day. Calgym turns photos into calories and macros, keeps your training on plan and shows your progress at a glance.`
- AR: `صوّر وجبتك وسجّل تمرينك وشاهد يومك. يحوّل كالجيم الصور إلى سعرات وعناصر غذائية، ويبقي تمرينك على الخطة، ويعرض تقدمك بلمحة.`

**13.3 Description.** Paste as is, English:

```
Calgym is a calorie and workout tracker that does the typing for you.

FOOD
• Snap a meal and get calories and macros in seconds, or describe it in words
• Scan barcodes; read a label when a product isn't found
• Plan meals and recipes, and see what's left for the day

TRAINING
• Weekly schedule, one-tap workouts, sets that remember your last session
• A rest timer on the lock screen, with −15 s, +15 s and Skip
• Workout history, personal records and progress

HEALTH
• Weight and body-composition trends; scan an InBody-style report
• Connect WHOOP for real calorie burn

AI COACH
• Ask about your nutrition and training; answers use your own numbers

SMART REMINDERS
• Planned from your own logs: nothing you've already done is reminded
• Water paced to your goal, a daily recap and a weekly wins summary
• Buttons right on the notification: add a glass, start your workout, or remind me later

Works as a guest — no account needed. English and Arabic.

Calgym Essentials and Calgym Pro are auto-renewing subscriptions, each starting with a 14-day free trial for new subscribers that includes everything. Essentials covers Food or Training, plus Health, with 20 AI actions a month. Pro covers Food, Training and Health together, with 50 AI actions a month, the AI program builder and a coach that remembers your documents. Without a subscription you can still view and export everything you recorded. Payment is charged to your Apple ID at confirmation. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the period; manage them in Settings → Apple ID → Subscriptions.
Terms: https://calapp-production-ab20.up.railway.app/terms · Privacy: https://calapp-production-ab20.up.railway.app/privacy

Calorie and nutrition figures are AI estimates and may be inaccurate. Not medical advice.
```

Arabic:

```
كالجيم عدّاد سعرات وتمارين يكتب عنك.

الطعام
• صوّر وجبتك واحصل على السعرات والعناصر الغذائية خلال ثوانٍ، أو صفها بالكلمات
• امسح الباركود، واقرأ الملصق إن لم يُعثر على المنتج
• خطط لوجباتك ووصفاتك واعرف المتبقي ليومك

التمرين
• جدول أسبوعي وتمارين بلمسة، ومجموعات تتذكر جلستك السابقة
• مؤقت راحة على شاشة القفل مع −١٥ ث و+١٥ ث وتخطٍّ
• سجل التمارين والأرقام القياسية والتقدم

الصحة
• اتجاهات الوزن وتركيب الجسم، وقراءة تقارير InBody
• اربط WHOOP لحرق السعرات الفعلي

المدرب الذكي
• اسأل عن تغذيتك وتمرينك بإجابات مبنية على أرقامك

تذكيرات ذكية
• مبنية على ما تسجّله: لا تذكير بشيء أنجزته
• ماء موزّع على يومك نحو هدفك، وملخص يومي وإنجازات أسبوعية
• أزرار في الإشعار نفسه: أضف كوب ماء، أو ابدأ تمرينك، أو ذكّرني لاحقاً

يعمل دون حساب، بالعربية والإنجليزية.

كالجيم الأساسيات وكالجيم برو اشتراكات تتجدد تلقائياً، ويبدأ كل منهما بتجربة مجانية لمدة ١٤ يوماً للمشتركين الجدد تشمل كل المزايا. الأساسيات تشمل التغذية أو التمارين مع الصحة و٢٠ عملية ذكاء اصطناعي شهرياً. برو يشمل التغذية والتمارين والصحة معاً، مع ٥٠ عملية شهرياً ومصمم البرامج الذكي ومدرب يتذكر ملفاتك. وبدون اشتراك يمكنك الاطلاع على كل ما سجّلته وتصديره. يُخصم المبلغ من حساب Apple عند التأكيد، ويتجدد الاشتراك ما لم يُلغَ قبل ٢٤ ساعة على الأقل من نهاية الفترة، ويُدار من الإعدادات ← Apple ID ← الاشتراكات.
الشروط: https://calapp-production-ab20.up.railway.app/terms · الخصوصية: https://calapp-production-ab20.up.railway.app/privacy

أرقام السعرات تقديرات بالذكاء الاصطناعي وقد تكون غير دقيقة، وليست نصيحة طبية.
```

**13.4 Keywords**
- EN: `calorie,counter,macro,tracker,diet,meal,food,scanner,workout,gym,fitness,protein,inbody,coach,weight`
- AR: `سعرات,حاسبة,رجيم,دايت,وجبات,بروتين,تمارين,جيم,لياقة,وزن,انبادي,تغذية,مدرب,كالوري`

**13.5 URLs**
- Support URL: `https://calapp-production-ab20.up.railway.app/support`
- Marketing URL: leave empty.

**13.6 Version and copyright**
- Version: `1.0.0`.
- Copyright: `2026 Bader Augaish`, or your company name if you publish as a company.

**13.7 App Review Information**
- **Sign-in required:** untick it. Guest mode needs no account.
- **Contact:** your name, phone and email.
- **Notes:** paste this (with the real code from step 10):

```
• No sign-in needed: tap "Continue as guest" on the first screen. Sign in with Apple, Google and email are also offered.
• Subscriptions: Calgym Essentials (Food or Training, plus Health) and Calgym Pro (both), each with a 14-day free trial that includes every feature. They are offered in the membership sheet after onboarding and in Profile → Membership, where Restore purchases, the trial terms and the Terms/Privacy links are shown. Please start the free trial with the sandbox account to reach every feature; without a plan the app shows recorded data read-only.
• Alternatively, Profile → Redeem a code → APPREVIEW gives Pro for 30 days.
• AI features (meal photo, describe a meal, body report scan, AI coach, recipe/program generation) ask permission before anything is sent to our AI providers (Anthropic, DeepSeek). This can be changed in Profile → Privacy → AI processing. Photos and messages are processed in real time and not stored.
• Account deletion: Profile → Privacy → Delete my account. It deletes on-device data, the cloud backup, the sign-in account and server records.
• Notifications are optional and local: they are planned on the device from the person's own logs (no remote push). Their buttons (add water, remind me later, start workout) act inside the app. Background modes (fetch, processing) are used only to re-plan these local reminders; the rest timer uses a Live Activity.
• Health figures are estimates with a disclaimer; the app gives no medical advice.
```

**13.8 Version Release:** choose **Manually release this version**, so you pick the launch moment.

Click **Save** at the top. Leave **Build** and **In-App Purchases** for step 17.

## Step 14 ⬜ TestFlight for outside testers (optional, can run in parallel)
1. **TestFlight → Test Information:**
   - **Beta App Description:** `Calgym is a calorie and workout tracker. Snap a meal for calories and macros, follow your weekly training with a rest timer, and track weight and body composition. Please try logging a meal, a workout and a body reading, and tell us what felt slow or unclear.`
   - **Feedback Email:** your support email.
   - **Privacy Policy URL:** `https://calapp-production-ab20.up.railway.app/privacy`
   - **Beta App Review Information:** your contact details, **Sign-in required: No**, and the same notes as in step 13.7.
2. **External Testing → +** → group name `Beta testers` → **Builds → +** → the newest build.
3. **What to Test:** `Log meals by photo or text, run a workout from Training (watch the rest timer on the lock screen), try the AI coach, and switch Arabic/English in Profile. Leave notifications on for a day: reminders only for what you haven't logged, an evening recap, and buttons to add water or start a workout.`
4. **Submit for Review.** The first review takes about 24–48 hours.
5. After approval: add testers by email, or turn on **Public Link** and share it.

## Step 15 🏦 Sandbox tester
1. App Store Connect → **Users and Access → Sandbox → Test Accounts → +**. Use an email that has never been an Apple ID, for example `yourname+sandbox1@gmail.com`.
2. On your iPhone: **Settings → Developer → Sandbox Apple Account** → sign in with it.
   - No **Developer** menu? Connect the phone to a Mac with Xcode once, or turn on **Settings → Privacy & Security → Developer Mode**.

## Step 16 🏦 Test a purchase
In the TestFlight build:
1. Open **Profile → Membership**. Choose **Training**, then start the **Essentials** free trial. Confirm with the sandbox account.
2. Check:
   - Profile shows **Essentials · Training** and **Free trial · ends …**.
   - **admin → Overview → Recent store events** shows the purchase, and the checklist ticks "First store event received".
3. **Profile → Membership → Pro:** the upgrade goes through straight away.
4. Delete and reinstall the app → **Restore purchases** → Pro comes back.

**Done when:** all of the above works. If something fails, send me a screenshot.

## Step 17 🏦 Submit for review
1. Your app → **1.0 Prepare for Submission**:
   - **Build → +:** choose **build 17** (or a newer one if we make it).
   - **In-App Purchases and Subscriptions → +:** tick the four sold products (Essentials Monthly and Yearly, Pro Monthly and Yearly). Not Pro+.
2. **Add for Review** (top right) → **Submit to App Review**.
3. Apple usually answers within 24–48 hours. If it's rejected, send me the message and I'll prepare the reply or the fix.

## Step 18 ⬜ Launch day (after "Pending Developer Release")
1. Send your testers the `FOUNDERS` code.
2. **admin → Membership → Plan locks → ON.** From now on, new users need a plan (with the 14-day trial).
3. App Store Connect → your version → **Release This Version**.
4. Buy once for real on your own phone. You can refund it via reportaproblem.apple.com.
5. Watch **admin → Overview** for the first days: purchases, AI failures and AI cost.

---

# Part B — Google Play

## Step 19 ⬜ Developer account
1. **play.google.com/console** → create an account. Choose **Organization** if you publish as a company (needs a D-U-N-S number) or **Personal** otherwise. The fee is $25.
2. **Personal accounts:** Google requires a closed test with **12 testers for 14 days** before production. Organization accounts don't.
3. **Setup → Payments profile:** add the bank account.

## Step 20 ⬜ Create the app
**All apps → Create app:**
- Name `Calgym`, default language English (United States).
- **App**, **Free**. Tick the declarations.

## Step 21 ⬜ App content (left menu → **Policy → App content**)
Answer each card:

| Card | Answer |
|---|---|
| Privacy policy | `https://calapp-production-ab20.up.railway.app/privacy` |
| Ads | **No** (Yes only while the Sponsor slot in admin → Content is switched on) |
| App access | "All or some functionality is restricted" → add instructions: `No login needed: tap "Continue as guest". Features beyond viewing need a subscription, which starts with a 14-day free trial. To test everything free: Profile → Redeem a code → APPREVIEW.` |
| Content rating | Start the questionnaire → category **Reference, News, or Educational**; answer No to violence, sex, gambling and similar; Yes to "users can interact with AI" if asked |
| Target audience | **13 and over**; not designed for children |
| Health apps | Tick **Nutrition and weight management** and **Activity and fitness**; not a medical device |
| Data safety | see step 22 |
| Account deletion | **Yes**, users can create an account. Web link `https://calapp-production-ab20.up.railway.app/account-deletion` |
| Government apps, financial features, news | **No** |

## Step 22 ⬜ Data safety
1. Does your app collect or share user data? **Yes**. Is all data encrypted in transit? **Yes**. Can users request deletion? **Yes**.
2. Tick these data types, and for each: **Collected: Yes, Shared: No**.

| Data type | Optional? | Purposes |
|---|---|---|
| Personal info → Email address | Optional | App functionality, Account management |
| Health and fitness → Health info | Optional | App functionality |
| Health and fitness → Fitness info | Optional | App functionality |
| Financial info → Purchase history | Optional | App functionality |
| App activity → App interactions | Required | App functionality, Analytics |
| Device or other IDs | Required | App functionality |
| Photos and videos → Photos | Optional, **processed ephemerally** | App functionality |
| Messages → Other in-app messages | Optional, **processed ephemerally** | App functionality |

The AI providers and RevenueCat work on your behalf, which Google does not count as "sharing".

## Step 23 ⬜ Store listing (Grow → Store presence → Main store listing)
- **App name:** `Calgym`
- **Short description (80):**
  - EN: `Snap a meal for calories and macros, follow your workouts, see your progress.`
  - AR: `صوّر وجبتك لتعرف السعرات والعناصر، وتابع تمارينك وتقدمك.`
- **Full description:** the same text as step 13.3 (English and Arabic). Replace "Apple ID" with "Google Play account", and "Settings → Apple ID → Subscriptions" with "Google Play → Payments & subscriptions".
- **App icon:** 512 × 512 PNG. **Feature graphic:** 1024 × 500.
- **Phone screenshots:** 2–8, the same shots as for Apple.
- **Category:** Health & Fitness. **Contact email:** your support email.
- Add Arabic with **Manage translations → Add your own translation → Arabic**.

## Step 24 ⬜ First upload (internal testing)
1. Tell me **"run the Android production build"**. It makes the `.aab` file Play needs; the APKs we have been testing are for direct install only.
2. **Test and release → Testing → Internal testing → Create new release** → upload the `.aab` → accept Play App Signing → release name `1.0.0` → **Save → Review → Start rollout**.
3. **Testers tab:** add your Gmail and open the opt-in link on your phone.
4. **Permissions Play will list:** notifications, camera, microphone and **"Schedule exact alarms"**. The last is for the rest timer's alert. It is the ordinary user-granted permission, not the restricted one, so no form is needed. If Play asks, answer: `A workout rest timer the user starts, which alerts when the rest ends.`

## Step 25 ⬜ Subscriptions on Play (Monetize → Products → Subscriptions)
Create four sold subscriptions (and the two Pro+ ones, left inactive), with the **same product IDs** as Apple:

| Product ID | Base plan ID | Period | Price (Saudi Arabia) |
|---|---|---|---|
| `calgym_essentials_monthly` | `monthly` | 1 month, auto-renewing | SAR 19.99 |
| `calgym_essentials_yearly` | `yearly` | 1 year, auto-renewing | SAR 149.99 |
| `calgym_pro_monthly` | `monthly` | 1 month, auto-renewing | SAR 24.99 |
| `calgym_pro_yearly` | `yearly` | 1 year, auto-renewing | SAR 199.99 |

On each of the four base plans: **Add offer**:
- Offer ID `trial14`.
- Eligibility **New customer acquisition**.
- Phase **Free trial, 14 days**.
- **Activate**.

## Step 26 ⬜ RevenueCat for Android
1. RevenueCat → **Apps & providers → + Play Store app** → package `com.augaish.calapp`.
2. **Service account credentials:** follow RevenueCat's "Google Play service credentials" guide.
   - Create a service account in Google Cloud.
   - In Play Console → **Users and permissions**, invite it with financial and order permissions.
   - Upload its JSON key to RevenueCat.
3. **Real-time developer notifications:** copy the Pub/Sub topic RevenueCat shows into Play Console → **Monetization setup**.
4. Add the four Play products in RevenueCat. Attach them to the same entitlements (step 7.4) and the same `default` offering packages (step 7.5).
5. Railway → Variables → `REVENUECAT_ANDROID_KEY` = the `goog_…` public key.
6. Play Console → **Setup → License testing:** add your Gmail. Buy in the internal build; license testers aren't charged.

## Step 27 ⬜ Production
1. **Test and release → Production → Create new release** → add the same `.aab` → **Review release → Start rollout to Production**.
2. The first review takes from a few days up to a week.

---

# Reference

## Google sign-in (one-time setup)
The app's "Continue with Google" button goes through Supabase Auth.
1. **console.cloud.google.com** → new project **Calgym**.
2. **APIs & Services → OAuth consent screen:**
   - External, app name Calgym, your support email.
   - Authorized domain `supabase.co`.
   - Scopes `email`, `profile`, `openid`.
   - Then **Publish app**.
3. **Credentials → Create credentials → OAuth client ID:**
   - Type **Web application**.
   - Redirect URI `https://uvhvxcvwpwkqvnvqdtyf.supabase.co/auth/v1/callback`.
   - Copy the Client ID and the secret.
4. **Supabase → Authentication → Sign In / Providers → Google:** enable it, paste both, and save.
5. **Supabase → Authentication → URL Configuration → Redirect URLs:** add `calapp://**`.

No app build is needed.

## What each build contains
- **Build 15:** the lock-screen and Dynamic Island rest countdown, and dark mode "System".
- **Build 16:** the larger lock-screen countdown.
- **Build 17 (28 September), the one to submit:**
  - Notification buttons work with the app closed.
  - Background refresh of reminders.
- **Android APK `ae922784` (28 September):** https://expo.dev/accounts/augaishb/projects/calapp/builds/ae922784-6494-4609-811e-e8c98ae089c1
  - The rest countdown on the lock screen, with −15 s, +15 s and Skip.
  - It becomes the "Rest over" alert when the rest ends.
  - On Android 14+, allow **Profile → Notifications → Allow exact rest alerts** once.
- Everything else (plans, Essentials, trial, smart reminders) also reaches older builds over the air.
