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
2. Under **iOS builds**, look for **build 19** (version 1.0.0), uploaded on 29 September. Build 18 crashes at launch (a component built for a newer Expo); build 19 fixes that. Don't use 18.
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
3. **Your testers (before launch):** admin → **Users → Give or remove a plan** → Pro, 90 days, for each tester. Apple doesn't allow an app's own codes to unlock paid features (rule 3.1.1), so free codes typed in the app now go through Apple and Google.
4. **Free codes for after launch** (gyms, partners, `FOUNDERS`), once the Paid Apps agreement is active:
   - App Store Connect → your app → **Subscriptions → Pro Monthly → Offer Codes → +**:
     - Type: **custom code**, for example `FOUNDERS`.
     - Eligibility: new and returning subscribers.
     - Offer: **Free**, for 1 or 3 months.
     - Set a redemption limit.
   - Google Play (later): a developer-determined offer on the Pro base plan with a free phase, for example offer id `founders`.
   - Admin → **Codes & partners → Promotion codes → New**:
     - Type **Free access**, tier Pro, days = the free period.
     - **App Store offer code** = the custom code from App Store Connect.
     - **Google Play offer id** = the Play offer.
   - In the app, typing the code opens Apple's (or Google's) own sheet with the code filled in. The store grants the free period and shows what follows before the person confirms.
5. **Membership → Plan locks:** leave **OFF** for now. It's switched on in step 18.

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
1. **Pricing and Availability** (left sidebar, under **Monetization**, next to Subscriptions; some screens call it **App Pricing**):
   - Price **Free** (USD 0). The subscriptions are sold inside the app.
   - Availability: all countries and regions.
2. **App Privacy → Privacy Policy URL:** `https://calapp-production-ab20.up.railway.app/privacy`
3. **App Privacy → Get Started / Edit:**
   - "Do you or your third-party partners collect data?" **Yes**.
   - Tick exactly these 10:

   | Section → item | Why |
   |---|---|
   | Contact Info → **Name** | Sign in with Apple or Google can pass the name to the account |
   | Contact Info → **Email Address** | Account sign-in |
   | Health & Fitness → **Health** | Weight, body readings, birth date, sex, height in the account backup |
   | Health & Fitness → **Fitness** | Workouts, meals, water in the backup; WHOOP data |
   | User Content → **Other User Content** | Recipes people write, saved in their backup |
   | Identifiers → **User ID** | The install or account ID |
   | **Purchases** | Subscription status (RevenueCat) |
   | Usage Data → **Product Interaction** | AI action counts, days used |
   | Diagnostics → **Other Diagnostic Data** | The phone model shown in the admin page |
   | User Content → **Photos or Videos** | Meal and report photos go to the AI providers, which may keep API data for a limited time under their terms. For this one only: **Linked to the user: No** |

   - For each one (10 in all, with Photos or Videos below): purpose **App Functionality** (Product Interaction: also **Analytics**); **Linked to the user: Yes**; **Used for tracking: No**.
   - Leave everything else unticked. Payment Info is handled by Apple. Calgym's server does not keep photos or coach messages; they are declared above (Photos or Videos; coach messages fall under Other User Content) because the AI providers may keep API data for a limited time.
4. **Publish** the privacy answers.

## Step 13 ⬜ The version page (1.0)
**Where:** your app → **iOS App → 1.0 Prepare for Submission**. Fill in the English page, then switch the language menu to Arabic and fill in the Arabic page.

**13.1 Screenshots** (3–10 per language)
- Ready-made sets are in `docs/store-screenshots/en` and `docs/store-screenshots/ar` (1290 × 2796). Drag them into **iPhone 6.9" Display** in the numbered order.
- They are drawn from the app's web preview with sample data. If you'd rather use captures from your iPhone (a Pro Max: 15, 16 or 17), take the same screens in light mode; they will match the submitted build exactly.

**13.2 Promotional Text** (170 characters)
- EN: `Track meals and workouts in one place. Plan what to eat, know what to train, and follow your progress with Calgym. In English and Arabic.`
- AR: `وجباتك وتمارينك في مكان واحد. خطط لأكلك، نظّم تمرينك، وتابع تقدمك مع كالجيم. بالعربية والإنجليزية.`

**13.3 Description.** Paste as is, English:

```
Make your next healthy step easier. Calgym brings food tracking, meal planning, workouts and body measurements together, so you can see what you've done and what comes next.

Plan meals you can cook, adjust portions, build your shopping list and record what you actually eat. Follow your training schedule, move a missed workout and keep your progress in view.

FOOD
• Snap a meal or describe it to get estimated calories, protein, carbs and fat
• Scan barcodes, and read the label when a product isn't found
• Recipes with ingredients and cooking steps; change the servings and the amounts follow
• A weekly meal plan, and a shopping list built from it

TRAINING
• Your weekly schedule, with the sets and reps from your last session in view
• Missed a workout? Move it to another day and carry on with your plan
• A rest timer that stays on your lock screen
• Workout history, personal records and progress

HEALTH
• Weight and body-composition trends, including readings from body-composition reports
• Connect WHOOP to see estimated calories burned

AI COACH
• Ask about your nutrition and training; answers use the data you choose to share

SMART REMINDERS
• Reminders adapt to what you've logged, with a daily recap and weekly highlights
• Add water, start a workout or snooze, right from the notification

Works as a guest — no account needed. In English and Arabic.

SUBSCRIPTIONS
Calgym Essentials (Food or Training, plus Health, with 20 AI actions a month) and Calgym Pro (Food, Training and Health, with 50 AI actions a month, the AI program builder and document summaries for the coach) are auto-renewing subscriptions.
Eligible new subscribers start with a 14-day free trial. The trial includes every Pro feature, with up to 50 AI actions, whichever plan you choose. It then renews as the plan you chose, at the price shown before you start, unless you cancel at least 24 hours before the trial ends.
Payment is charged to your Apple ID account when the free trial ends, or when you confirm the purchase if there is no trial. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel in Settings → Apple ID → Subscriptions.
Without a subscription you can still view and export everything you recorded.
Terms: https://calapp-production-ab20.up.railway.app/terms · Privacy: https://calapp-production-ab20.up.railway.app/privacy

AI-generated nutrition estimates may be inaccurate: review portions and ingredients before logging. Calgym does not give medical advice.
```

Arabic:

```
خطوتك التالية نحو عادات صحية أوضح وأسهل. يجمع كالجيم متابعة الغذاء وتخطيط الوجبات والتمارين وقياسات الجسم، لتعرف ما أنجزته وما ينتظرك.

خطط لوجباتك بمكونات وخطوات تحضير واضحة، وعدّل الحصص وجهّز قائمة التسوق وسجّل ما أكلته فعلاً. تابع جدول تمارينك، وأعد جدولة التمرين الذي فاتك، وشاهد تقدمك.

الغذاء
• صوّر وجبتك أو صفها لتحصل على تقدير للسعرات والبروتين والكربوهيدرات والدهون
• امسح الباركود، واقرأ الملصق إن لم يُعثر على المنتج
• وصفات بمكوناتها وخطوات تحضيرها، والكميات تتغير مع عدد الحصص
• خطة وجبات أسبوعية وقائمة تسوق مبنية عليها

التمارين
• جدولك الأسبوعي، مع مجموعاتك وتكراراتك من تمرينك السابق أمامك
• فاتك تمرين؟ انقله إلى يوم آخر وتابع خطتك
• مؤقت راحة يبقى ظاهراً على شاشة القفل
• سجل التمارين والأرقام القياسية وتقدمك

الصحة
• اتجاهات الوزن وتركيب الجسم، ومنها قراءات تقارير تركيب الجسم
• اربط WHOOP لمتابعة تقديرات السعرات المحروقة

المدرب الذكي
• اسأل عن تغذيتك وتمرينك، وتعتمد الإجابات على البيانات التي تختار مشاركتها

تذكيرات ذكية
• تذكيرات تتكيّف مع ما سجّلته، مع ملخص يومي وأبرز إنجازات الأسبوع
• أضف ماءً أو ابدأ تمرينك أو أجّل التذكير من الإشعار مباشرة

يعمل دون حساب، بالعربية والإنجليزية.

الاشتراكات
كالجيم الأساسيات (التغذية أو التمارين مع الصحة، و٢٠ عملية ذكاء اصطناعي شهرياً) وكالجيم برو (التغذية والتمارين والصحة، و٥٠ عملية شهرياً، ومصمم البرامج الذكي وملخصات ملفاتك للمدرب) اشتراكات تتجدد تلقائياً.
يحصل المشتركون الجدد المؤهلون على تجربة مجانية لمدة ١٤ يوماً تشمل كل مزايا برو بحد أقصى ٥٠ عملية ذكاء اصطناعي، أياً كانت الخطة التي تختارها، ثم تتجدد بالخطة التي اخترتها وبالسعر المعروض قبل البدء، ما لم تُلغِها قبل ٢٤ ساعة على الأقل من نهاية التجربة.
يُخصم المبلغ من حساب Apple عند انتهاء التجربة المجانية، أو عند تأكيد الشراء إن لم تكن هناك تجربة. يتجدد الاشتراك تلقائياً ما لم يُلغَ قبل ٢٤ ساعة على الأقل من نهاية الفترة الحالية، ويمكنك إدارته أو إلغاؤه من الإعدادات ← Apple ID ← الاشتراكات.
وبدون اشتراك يمكنك الاطلاع على كل ما سجّلته وتصديره.
الشروط: https://calapp-production-ab20.up.railway.app/terms · الخصوصية: https://calapp-production-ab20.up.railway.app/privacy

تقديرات التغذية المولّدة بالذكاء الاصطناعي قد تكون غير دقيقة، فراجع الحصص والمكونات قبل التسجيل. كالجيم لا يقدّم نصيحة طبية.
```

**13.4 Keywords** (under 100 bytes each; words already in the name or subtitle are left out, since Apple searches those anyway)
- EN: `macro,meal,recipe,gym,protein,weight,planner,nutrition,barcode,fitness,diary,diet,coach,shopping`
- AR: `تغذية,وجبات,بروتين,وزن,وصفات,لياقة,رجيم,دايت,جيم,صيام`

**13.5 URLs**
- Support URL: `https://calapp-production-ab20.up.railway.app/support`
- Marketing URL: leave empty.

**13.6 Version and copyright**
- Version: `1.0.0`.
- Copyright: `2026 Bader Augaish`, or your company name if you publish as a company.

**13.7 App Review Information**
- **Sign-in required:** untick it. Guest mode needs no account.
- **Contact:** your name, phone and email.
- **Notes:** paste this:

```
• No sign-in needed: tap "Continue as guest" on the first screen. Sign in with Apple, Google and email are also offered.
• Subscriptions: Calgym Essentials (Food or Training, plus Health) and Calgym Pro (both). Eligible new subscribers get a 14-day free trial that includes every Pro feature (up to 50 AI actions); it then renews as the plan chosen. Plans are offered in the membership sheet after onboarding and in Profile → Membership, with Restore purchases, the trial terms and the Terms/Privacy links. Please start the free trial with your sandbox account to reach every feature; without a plan the app shows recorded data read-only.
• AI features (meal photo, describe a meal, body report scan, AI coach, recipe and program generation) ask permission before anything is sent to our AI providers (Anthropic, DeepSeek); this can be changed in Profile → Privacy → AI processing. Calgym's server does not keep the photos or messages after the answer; the providers process them under their own API terms.
• Account deletion: Profile → Privacy → Delete my account. It deletes the on-device data, the cloud backup, the sign-in account and the server records.
• Notifications are optional and scheduled on the device from the person's own logs; the app sends no remote push. Their buttons (add water, remind me later, start workout) act inside the app. The background modes (fetch, processing) are used only to re-plan these reminders; the rest timer uses a Live Activity.
• Nutrition figures are estimates with a disclaimer; the app gives no medical advice.
```

**13.8 Version Release:** choose **Manually release this version**, so you pick the launch moment.

Click **Save** at the top. Leave **Build** and **In-App Purchases** for step 17.

## Step 14 ⬜ TestFlight for outside testers (optional, can run in parallel)
1. **TestFlight → Test Information:**
   - **Beta App Description:** `Calgym is a calorie and workout tracker. Snap a meal for calories and macros, follow your weekly training with a rest timer, and track weight and body composition. Please try logging a meal, a workout and a body reading, and tell us what felt slow or unclear.`
   - **Feedback Email:** support@calgym.org
   - **Privacy Policy URL:** `https://calapp-production-ab20.up.railway.app/privacy`
   - **Beta App Review Information:** your contact details, **Sign-in required: No**, and the same notes as in step 13.7.
2. **External Testing → +** → group name `Beta testers` → **Builds → +** → the newest build.
3. **What to Test:** `Log meals by photo or text, run a workout from Training (watch the rest timer on the lock screen), try the AI coach, and switch Arabic/English in Profile. Leave notifications on for a day: reminders only for what you haven't logged, an evening recap, and buttons to add water or start a workout.`
4. **Submit for Review.** The first review takes about 24–48 hours.
5. After approval: add testers by email, or turn on **Public Link** and share it.

## Step 15 ⏭️ Sandbox tester (skip)
Not needed. The app is tested through TestFlight, and TestFlight purchases use your normal Apple ID and are never charged. Sandbox test accounts are for builds installed from a Mac with Xcode, which we don't use.

## Step 16 🏦 Test a purchase
In the TestFlight build, **signed in with a second Calgym account** (for example `augaishb1+test@gmail.com`), not your own Pro+ account. Store events replace a plan granted in admin, so a test subscription ending later would drop your own account to Free. Don't tap **Restore purchases** while signed in to your own account: that moves the test subscription onto it.
1. Open **Profile → Membership**. Choose **Training**, then start the **Essentials** free trial. Confirm with your normal Apple ID. The sheet says "[Environment: Sandbox]", which means no money is taken.
2. Check:
   - Profile shows **Essentials · Training** and **Free trial · ends …**.
   - **admin → Overview → Recent store events** shows the purchase, and the checklist ticks "First store event received".
3. **Profile → Membership → Pro:** the upgrade goes through straight away.
4. Delete and reinstall the app → **Restore purchases** → Pro comes back.

**Done when:** all of the above works. If something fails, send me a screenshot.

## Step 17 🏦 Submit for review
1. Your app → **1.0 Prepare for Submission**:
   - **Build → +:** choose **build 19** (or a newer one if we make it). Not 18.
   - **In-App Purchases and Subscriptions → +:** tick the four sold products (Essentials Monthly and Yearly, Pro Monthly and Yearly). Not Pro+.
2. **Add for Review** (top right) → **Submit to App Review**.
3. Apple usually answers within 24–48 hours. If it's rejected, send me the message and I'll prepare the reply or the fix.

## Step 18 ⬜ Launch day (after "Pending Developer Release")
1. Check your testers have their plan (admin → Users; granted in step 10). The `FOUNDERS` offer code from step 10 works for anyone new.
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
| App access | "All or some functionality is restricted" → add instructions: `No login needed: tap "Continue as guest". Features beyond viewing need a subscription: Profile → Membership → start the 14-day free trial (every feature included) with a license-test account.` |
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
- **Category:** Health & Fitness. **Contact email:** support@calgym.org.
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
2. **Google Auth Platform → Branding** (older consoles: **APIs & Services → OAuth consent screen**):
   - App name **Calgym**.
   - User support email: your own Gmail. Google only accepts the signed-in account or a Google Group here, not support@calgym.org. People see it on the Google sign-in screen.
   - Audience: **External**. Developer contact email: **support@calgym.org** (any address works here).
   - Then, back on **Branding**, scroll to **Authorized domains → + Add domain** → `uvhvxcvwpwkqvnvqdtyf.supabase.co` (the project’s own address; plain `supabase.co` is refused) → **Save**.
3. **Data Access → Add or remove scopes:** tick `.../auth/userinfo.email`, `.../auth/userinfo.profile` and `openid` → **Update** → **Save**.
4. **Clients → + Create client:**
   - Application type **Web application**, name `Calgym (Supabase)`.
   - **Authorized redirect URIs → + Add URI:** `https://uvhvxcvwpwkqvnvqdtyf.supabase.co/auth/v1/callback`.
   - **Create.** Copy the **Client ID** and **Client secret** straight away, or download the JSON: Google may not show the secret again.
5. **Audience → Publishing status: Testing → Publish app → Confirm.** While it says Testing, only listed test users can sign in with Google.
6. **Supabase → Authentication → Sign In / Providers → Google:** enable it, paste the Client ID and secret, and save.
7. **Supabase → Authentication → URL Configuration → Redirect URLs:** add `calapp://**`.

No app build is needed.

## What each build contains
- **Build 15:** the lock-screen and Dynamic Island rest countdown, and dark mode "System".
- **Build 16:** the larger lock-screen countdown.
- **Build 18 (29 September): don't use.** It crashes at launch: the PDF component was built for a newer Expo core.
- **Build 19 (29 September), the one to submit:** everything in build 17, plus Export my data as a PDF report or a data file.
- **Build 17 (28 September):**
  - Notification buttons work with the app closed.
  - Background refresh of reminders.
- **Android APK `ae922784` (28 September):** https://expo.dev/accounts/augaishb/projects/calapp/builds/ae922784-6494-4609-811e-e8c98ae089c1
  - The rest countdown on the lock screen, with −15 s, +15 s and Skip.
  - It becomes the "Rest over" alert when the rest ends.
  - On Android 14+, allow **Profile → Notifications → Allow exact rest alerts** once.
- Everything else (plans, Essentials, trial, smart reminders) also reaches older builds over the air.
