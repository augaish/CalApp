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
> • A rest timer that keeps counting on the lock screen
> • Workout history, personal records and progress
>
> HEALTH
> • Weight and body-composition trends; scan an InBody-style report
> • Connect WHOOP for real calorie burn
>
> AI COACH
> • Ask about your nutrition and training; answers use your own numbers
>
> Works as a guest — no account needed. English and Arabic.
>
> Calgym Pro and Pro+ are optional auto-renewing subscriptions with larger monthly AI allowances. Payment is charged to your Apple ID at confirmation. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the period; manage them in Settings → Apple ID → Subscriptions.
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
> • مؤقت راحة يستمر على شاشة القفل
> • سجل التمارين والأرقام القياسية والتقدم
>
> الصحة
> • اتجاهات الوزن وتركيب الجسم، وقراءة تقارير InBody
> • اربط WHOOP لحرق السعرات الفعلي
>
> المدرب الذكي
> • اسأل عن تغذيتك وتمرينك بإجابات مبنية على أرقامك
>
> يعمل دون حساب، بالعربية والإنجليزية.
>
> اشتراكات Pro وPro+ اختيارية تتجدد تلقائياً مع حدود أعلى للذكاء الاصطناعي. يُخصم المبلغ من حساب Apple عند التأكيد، ويتجدد الاشتراك ما لم يُلغَ قبل ٢٤ ساعة من نهاية الفترة، ويُدار من الإعدادات ← Apple ID ← الاشتراكات.
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
> • Subscriptions (Pro, Pro+): Profile → Membership, or the membership sheet. Restore purchases is on that screen. Terms and privacy links are on the paywall.
> • Promo codes: Profile → Redeem a code. Test code: (create one in the admin console, e.g. a 7-day free code, and put it here).
> • Health figures are estimates with a disclaimer; the app gives no medical advice.

### Export compliance
The app only uses standard HTTPS. `ITSAppUsesNonExemptEncryption` is already `false` in `app.json`, so builds won't ask.

### Screenshots (6.9" iPhone required; 6.5" optional)
Suggested order: Overview (today), meal scan result, Training with the schedule, an active workout with the rest timer, Health body composition, AI coach. Take them in light mode, with one Arabic set if you list Arabic.

---

## Google Play Console

- **App category:** Health & Fitness · **Contact email:** the support address · **Privacy policy:** `/privacy`
- **Ads:** answer **Yes** only while the Sponsor slot (admin → Content) is switched on. It is an in-app promotion. Otherwise No.
- **App access:** all functionality is available without special access (guest mode).
- **Content rating (IARC):** a reference/utility app with no violence or other flagged content; mention the AI chat when asked.
- **Target audience:** 13+ (not designed for children).
- **Health apps declaration:** select "Nutrition and weight management" and "Activity and fitness". The app is not a medical device.
- **Account deletion:** the app lets users create an account, so answer **Yes**. Web link: `/account-deletion`.

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

## After the bank account (for completeness)
1. App Store Connect → Agreements, Tax and Banking → Paid Apps.
2. Create the subscription products and the RevenueCat project (`billing-setup.md`).
3. Build 12 (below), test purchases with sandbox testers, then submit.

### Build 12 carries (native changes since build 11)
- The lock-screen and Dynamic Island rest countdown (`expo-live-activity`, a new widget extension). EAS will create the extension's bundle ID `com.augaish.calapp.LiveActivity` and its profile on the first build.
- Dark mode "System" for the app chrome (`userInterfaceStyle: automatic`).

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
