/**
 * Privacy policy and terms, served as public pages. App Store Connect and the
 * Play Console both require a reachable privacy-policy URL, and the app links
 * to these from Profile → Legal.
 *
 * Keep these accurate: they describe what the app actually does today.
 */
const CONTACT = process.env.SUPPORT_EMAIL ?? 'support@calgym.org';
const UPDATED = 'September 2026';
const UPDATED_AR = 'سبتمبر ٢٠٢٦';

const STYLE = `
  :root { --bg:#F5F3FA; --card:#fff; --text:#2A2440; --muted:#6B6480; --line:#E6E1F0; --primary:#6D5AAB; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#17141F; --card:#221D2E; --text:#F2EFF8; --muted:#A69FBA; --line:#332C44; }
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); padding:24px 16px;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; line-height:1.6; }
  .wrap { max-width:720px; margin:0 auto; background:var(--card); border:1px solid var(--line);
    border-radius:16px; padding:28px; }
  h1 { font-size:24px; margin:0 0 4px; }
  h2 { font-size:17px; margin:26px 0 6px; color:var(--primary); }
  .updated { color:var(--muted); font-size:13px; margin-bottom:18px; }
  ul { padding-inline-start:20px; }
  li { margin-bottom:6px; }
  a { color:var(--primary); }
  hr { border:0; border-top:1px solid var(--line); margin:32px 0; }
  .ar { direction:rtl; text-align:right; }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} · Calgym</title>
<style>${STYLE}</style>
</head>
<body><div class="wrap">${body}</div></body>
</html>`;
}

export const PRIVACY_HTML = page(
  'Privacy Policy',
  `<h1>Privacy Policy</h1>
<div class="updated">Calgym · Last updated ${UPDATED}</div>

<p>Calgym helps you track meals and workouts. This policy explains what we collect, why, who else handles it and how to delete it. We collect as little as the app needs to work.</p>

<h2>Where your logged data lives</h2>
<p>Your logged data — profile details, meals, workouts, water, weight and your weekly schedule — is stored on your phone. If you use the app as a guest it never leaves the device except as described below.</p>
<p>If you create an account (with Apple, Google or email), a backup copy is kept in that account so your history survives a lost or replaced phone. Only you can read it. Photos are never stored — not on our servers and not in the backup. Deleting your account deletes the backup and the account.</p>

<h2>AI features and who processes them</h2>
<p>Scanning a meal, gym equipment or a body-composition report, describing or adjusting a meal, looking up an exercise, asking the AI coach (with any file you attach), and generating a recipe or program all send that content — the photo, report or your words — to our server, which passes it to an AI provider to produce the answer:</p>
<ul>
  <li><strong>Anthropic</strong> (Claude), United States, and</li>
  <li><strong>DeepSeek</strong>, China,</li>
</ul>
<p>depending on your plan and on which service is available. Each processes the content under its own API terms. We send only what is needed to answer — never your name or email — and our server does not keep your photos, reports or messages after the answer is returned. The providers may keep what they receive for a limited period under their own terms (for example, for safety and abuse monitoring). The app asks your permission before anything is sent to an AI provider for the first time, and you can withdraw it at any time in Profile → Settings → Privacy &amp; data → AI processing. The AI coach also receives a short summary of your recent totals (calories, macros, workouts) so its answer can refer to your own data; it is used only for that reply. You choose what it may see in Profile → Settings → Privacy &amp; data → Manage shared context.</p>

<h2>WHOOP</h2>
<p>If you connect WHOOP, we read your WHOOP workouts, recovery, sleep and daily strain through WHOOP's official API, with the permission you give on WHOOP's own sign-in page. We use your WHOOP workouts to show the calories you really burned in the app, and — only if you allow it — your recovery, sleep and strain to give the AI coach context for its reply. WHOOP data sent to the coach goes only to Anthropic, never to DeepSeek, and is used only for that reply. We never sell WHOOP data, share it with anyone else, or use it to train AI models.</p>
<p>Disconnecting WHOOP (Health → Connections, or Profile → Settings → Privacy &amp; data → Connections) cancels our access at WHOOP, deletes our access tokens and removes WHOOP data from the app and your backup. Deleting your account does the same.</p>

<h2>What our server keeps</h2>
<ul>
  <li><strong>An installation ID</strong> — a random identifier made on your phone — with how many AI actions you used each month, their cost, and which days you used the app. This applies plan limits and gives us overall usage figures. For a guest it is linked to nothing personal.</li>
  <li><strong>Your email address</strong>, if you create an account, with your plan — so we can recognise your account and help you if you contact support. Never used for marketing.</li>
  <li><strong>Your subscription status.</strong> Purchases are made and paid through Apple or Google; we never see card details. We use RevenueCat to confirm what you are subscribed to: it receives the installation or account ID and the store's purchase records.</li>
  <li><strong>Promotion and partner codes</strong> you redeem, and when. If a code belongs to one of our partners, they see only totals — how many used it and what it earned — never who you are.</li>
  <li><strong>A WHOOP connection</strong>, only if you connect one: the access tokens needed to read your WHOOP data (see WHOOP above). Our server does not store your WHOOP data itself. Disconnect any time in Connections; it is deleted with your account.</li>
  <li><strong>A workout plan you choose to share</strong>: exercises and target sets only, deleted after six months.</li>
</ul>

<h2>Notifications</h2>
<p>Reminders, the end-of-rest alert and the lock-screen rest countdown are scheduled on your phone. Nothing about them is sent to us.</p>

<h2>Barcode lookups</h2>
<p>Scanning a barcode checks our own product database first, then <a href="https://world.openfoodfacts.org">Open Food Facts</a>, a free public food database — only the barcode number is sent to either. If a product isn't found and you resolve it yourself by photographing its label, the name and nutrition we read are saved against that barcode so the next person who scans the same product gets an instant result — no personal or photo data is kept, only the product's own nutrition facts.</p>

<h2>Product data credits</h2>
<p>Packaged-product nutrition shown in Calgym may come from <a href="https://world.openfoodfacts.org">Open Food Facts</a>, made available under the <a href="https://opendatacommons.org/licenses/odbl/1-0/">Open Database License (ODbL) v1.0</a>. Individual product facts are used under the <a href="https://opendatacommons.org/licenses/dbcl/1-0/">Database Contents License</a>. Open Food Facts contributors are not affiliated with Calgym and do not endorse it. Where a product's nutrition was read from its own label instead, Calgym shows no such credit, because that reading is our own.</p>

<h2>What we do not do</h2>
<ul>
  <li>We do not sell or rent your data.</li>
  <li>We do not use third-party advertising or tracking networks, and we do not build advertising profiles.</li>
  <li>Any sponsor shown in the app is a fixed placement; it does not receive your data and does not track you.</li>
</ul>

<h2>How long we keep things</h2>
<ul>
  <li>AI content (photos, reports, messages): not kept after the answer.</li>
  <li>Your account, backup, usage and connections: until you delete your account.</li>
  <li>Records of purchases and partner commissions: kept for accounting, without anything that identifies you once your account is deleted.</li>
</ul>

<h2>Your choices</h2>
<ul>
  <li><strong>Export.</strong> Profile → Settings → Privacy &amp; data → Export my data gives you a copy of everything stored on your device.</li>
  <li><strong>AI processing.</strong> Profile → Settings → Privacy &amp; data → AI processing turns it off or on.</li>
  <li><strong>Delete.</strong> Profile → Settings → Privacy &amp; data → Delete my account erases the data on your phone, your backup, your sign-in account and every server record linked to you. This cannot be undone. Without the app, use <a href="/account-deletion">our account deletion page</a>.</li>
  <li><strong>Subscriptions</strong> are cancelled in your App Store or Google Play settings; deleting the app or your account does not cancel them.</li>
</ul>

<h2>Children</h2>
<p>Calgym is not directed to children under 13, and we do not knowingly collect their data.</p>

<h2>Health disclaimer</h2>
<p>Calorie and nutrition figures are AI estimates and can be inaccurate. Calgym provides general guidance, not medical advice. Consult a qualified professional for medical or dietary decisions.</p>

<h2>Contact</h2>
<p>Questions or requests: <a href="mailto:${CONTACT}">${CONTACT}</a> · <a href="/support">Support</a></p>

<hr />

<div class="ar">
<h1>سياسة الخصوصية</h1>
<div class="updated">كالجيم · آخر تحديث ${UPDATED_AR}</div>
<p>يساعدك كالجيم على تتبع وجباتك وتمارينك. توضّح هذه السياسة ما نجمعه ولماذا، ومن يعالجه غيرنا، وكيف تحذفه. نجمع أقل ما يحتاجه التطبيق ليعمل.</p>

<h2>أين تُحفظ بياناتك</h2>
<p>بياناتك المسجّلة — ملفك الشخصي والوجبات والتمارين والماء والوزن وجدولك الأسبوعي — تُحفظ على هاتفك. وإذا استخدمت التطبيق كضيف فلا تغادر الجهاز إلا كما هو موضّح أدناه.</p>
<p>وإذا أنشأت حساباً (عبر Apple أو Google أو البريد الإلكتروني)، تُحفظ نسخة احتياطية في حسابك حتى لا تفقد سجلك عند تغيير الهاتف أو فقدانه، ولا يقرؤها أحد غيرك. لا تُحفظ الصور أبداً — لا على خوادمنا ولا في النسخة الاحتياطية. وحذف حسابك يحذف النسخة الاحتياطية والحساب نفسه.</p>

<h2>ميزات الذكاء الاصطناعي ومن يعالجها</h2>
<p>عند مسح وجبة أو جهاز رياضي أو تقرير تركيب الجسم، أو وصف وجبة أو تعديلها، أو البحث عن تمرين، أو سؤال المدرب الذكي (مع أي ملف ترفقه)، أو إنشاء وصفة أو برنامج، يُرسل المحتوى — الصورة أو التقرير أو كلماتك — إلى خادمنا الذي يمرّره إلى مزوّد ذكاء اصطناعي لإنتاج الإجابة:</p>
<ul>
  <li><strong>Anthropic</strong> ‏(Claude)، الولايات المتحدة، و</li>
  <li><strong>DeepSeek</strong>، الصين،</li>
</ul>
<p>بحسب باقتك والخدمة المتاحة، ويعالج كلٌّ منهما المحتوى وفق شروط واجهته البرمجية. نرسل فقط ما يلزم للإجابة — ولا نرسل اسمك أو بريدك أبداً — ولا يحتفظ خادمنا بصورك أو تقاريرك أو رسائلك بعد إرجاع الإجابة. وقد يحتفظ المزوّدون بما يصلهم لفترة محدودة وفق شروطهم (مثلاً لأغراض السلامة ومنع إساءة الاستخدام). يطلب التطبيق إذنك قبل إرسال أي شيء إلى مزوّد ذكاء اصطناعي أول مرة، ويمكنك سحب الإذن في أي وقت من الملف الشخصي ← الإعدادات ← الخصوصية والبيانات ← المعالجة بالذكاء الاصطناعي. ويتلقى المدرب الذكي أيضاً ملخصاً قصيراً لإجمالياتك الأخيرة (السعرات والعناصر الغذائية والتمارين) ليكون الرد مخصصاً لك، ويُستخدم لذلك الرد فقط. وتختار ما يمكنه رؤيته من الملف الشخصي ← الإعدادات ← الخصوصية والبيانات ← إدارة السياق المشترك.</p>

<h2>WHOOP</h2>
<p>إذا ربطت WHOOP، نقرأ تمارينك والتعافي والنوم والإجهاد اليومي من WHOOP عبر واجهته البرمجية الرسمية، بالإذن الذي تمنحه في صفحة تسجيل الدخول الخاصة بـ WHOOP. نستخدم تمارينك في WHOOP لعرض السعرات التي أحرقتها فعلاً في التطبيق، ونستخدم التعافي والنوم والإجهاد لإعطاء المدرب الذكي سياقاً لرده فقط إذا سمحت بذلك. وما يُرسل من بيانات WHOOP إلى المدرب يذهب إلى Anthropic فقط، ولا يُرسل إلى DeepSeek أبداً، ويُستخدم لذلك الرد فقط. ولا نبيع بيانات WHOOP ولا نشاركها مع أي جهة أخرى ولا نستخدمها لتدريب نماذج الذكاء الاصطناعي.</p>
<p>فصل WHOOP (الصحة ← الربط، أو الملف الشخصي ← الإعدادات ← الخصوصية والبيانات ← الربط) يلغي وصولنا لدى WHOOP، ويحذف رموز الوصول، ويزيل بيانات WHOOP من التطبيق ومن نسختك الاحتياطية. وحذف حسابك يفعل الشيء نفسه.</p>

<h2>ما يحفظه خادمنا</h2>
<ul>
  <li><strong>معرّف التثبيت</strong> — رقم عشوائي يُنشأ على هاتفك — مع عدد عمليات الذكاء الاصطناعي التي استخدمتها كل شهر وتكلفتها والأيام التي استخدمت فيها التطبيق، لتطبيق حدود الباقة ومعرفة الاستخدام العام. وللضيف لا يرتبط بأي بيانات شخصية.</li>
  <li><strong>بريدك الإلكتروني</strong> إذا أنشأت حساباً، مع باقتك، لنتعرّف على حسابك ونساعدك عند التواصل مع الدعم. لا يُستخدم للتسويق.</li>
  <li><strong>حالة اشتراكك:</strong> تتم المشتريات والدفع عبر Apple أو Google ولا نرى بيانات بطاقتك. ونستخدم RevenueCat للتحقق من اشتراكك، ويتلقى معرّف التثبيت أو الحساب وسجلات الشراء من المتجر.</li>
  <li><strong>أكواد العروض والشركاء</strong> التي تستخدمها ومتى. وإذا كان الكود لأحد شركائنا فلا يرى إلا الإجماليات — عدد من استخدموه وما حققه — ولا يعرف هويتك أبداً.</li>
  <li><strong>ربط WHOOP</strong> إن اخترت ربطه فقط: رموز الوصول اللازمة لقراءة بياناتك من WHOOP (انظر قسم WHOOP أعلاه). ولا يحفظ خادمنا بيانات WHOOP نفسها. يمكنك فصله في أي وقت من صفحة الربط، ويُحذف مع حسابك.</li>
  <li><strong>جدول تمرين تختار مشاركته:</strong> التمارين والمجموعات المستهدفة فقط، ويُحذف بعد ستة أشهر.</li>
</ul>

<h2>الإشعارات</h2>
<p>التذكيرات وتنبيه انتهاء الراحة والعدّ التنازلي على شاشة القفل تُجدوَل على هاتفك، ولا يُرسل إلينا شيء عنها.</p>

<h2>مسح الباركود</h2>
<p>عند مسح باركود نبحث أولاً في قاعدة منتجاتنا، ثم في <a href="https://world.openfoodfacts.org">Open Food Facts</a>، وهي قاعدة بيانات غذائية عامة ومجانية — ولا يُرسل إلى أي منهما سوى رقم الباركود. وإذا لم يُعثر على المنتج وقمت بحلّه بنفسك عبر تصوير ملصقه، يُحفظ الاسم والقيم الغذائية التي قرأناها مقابل ذلك الباركود ليحصل من يمسحه لاحقاً على نتيجة فورية — دون حفظ أي بيانات شخصية أو صور.</p>

<h2>مصادر بيانات المنتجات</h2>
<p>قد تأتي القيم الغذائية للمنتجات المعلّبة الظاهرة في كالجيم من <a href="https://world.openfoodfacts.org">Open Food Facts</a>، المتاحة بموجب <a href="https://opendatacommons.org/licenses/odbl/1-0/">رخصة قاعدة البيانات المفتوحة (ODbL) الإصدار 1.0</a>، وتُستخدم حقائق المنتجات الفردية بموجب <a href="https://opendatacommons.org/licenses/dbcl/1-0/">رخصة محتويات قاعدة البيانات</a>. والمساهمون في Open Food Facts لا تربطهم بكالجيم أي علاقة.</p>

<h2>ما لا نفعله</h2>
<ul>
  <li>لا نبيع بياناتك ولا نؤجّرها.</li>
  <li>لا نستخدم شبكات إعلانات أو تتبّع خارجية، ولا نبني ملفات إعلانية عنك.</li>
  <li>أي راعٍ يظهر في التطبيق هو مساحة ثابتة لا تتلقى بياناتك ولا تتعقبك.</li>
</ul>

<h2>مدة الاحتفاظ</h2>
<ul>
  <li>محتوى الذكاء الاصطناعي (الصور والتقارير والرسائل): لا يُحتفظ به بعد الإجابة.</li>
  <li>حسابك ونسختك الاحتياطية واستخدامك وروابطك: حتى تحذف حسابك.</li>
  <li>سجلات المشتريات وعمولات الشركاء: تُحفظ لأغراض محاسبية، دون أي شيء يعرّف بك بعد حذف حسابك.</li>
</ul>

<h2>خياراتك</h2>
<ul>
  <li><strong>التصدير:</strong> الملف الشخصي ← الإعدادات ← الخصوصية والبيانات ← تصدير بياناتي.</li>
  <li><strong>المعالجة بالذكاء الاصطناعي:</strong> الملف الشخصي ← الإعدادات ← الخصوصية والبيانات ← المعالجة بالذكاء الاصطناعي لإيقافها أو تشغيلها.</li>
  <li><strong>الحذف:</strong> الملف الشخصي ← الإعدادات ← الخصوصية والبيانات ← حذف حسابي يمسح بيانات هاتفك ونسختك الاحتياطية وحساب الدخول وكل سجل مرتبط بك على خوادمنا نهائياً. ودون التطبيق استخدم <a href="/account-deletion">صفحة حذف الحساب</a>.</li>
  <li><strong>الاشتراكات</strong> تُلغى من إعدادات App Store أو Google Play، ولا يلغيها حذف التطبيق أو الحساب.</li>
</ul>

<h2>الأطفال</h2>
<p>كالجيم غير موجّه للأطفال دون ١٣ عاماً، ولا نجمع بياناتهم عن علم.</p>

<h2>إخلاء مسؤولية صحية</h2>
<p>أرقام السعرات تقديرية بالذكاء الاصطناعي وقد تكون غير دقيقة، وهي إرشادية وليست نصيحة طبية.</p>

<h2>للتواصل</h2>
<p><a href="mailto:${CONTACT}">${CONTACT}</a> · <a href="/support">الدعم</a></p>
</div>`,
);

export const TERMS_HTML = page(
  'Terms of Use',
  `<h1>Terms of Use</h1>
<div class="updated">Calgym · Last updated ${UPDATED}</div>

<p>By using Calgym you agree to these terms.</p>

<h2>The service</h2>
<p>Calgym is a calorie and workout tracker with AI-assisted estimates. It is provided as-is, without warranty. We may change or discontinue features.</p>

<h2>Not medical advice</h2>
<p>Calorie, macro and calorie-burn figures are estimates produced by AI and may be wrong. Calgym does not provide medical, dietary or training advice, diagnosis or treatment. Always consult a qualified professional before making health decisions, especially if you have a medical condition, are pregnant, or are under 18.</p>

<h2>Acceptable use</h2>
<ul>
  <li>Do not misuse the service, attempt to bypass plan limits, or disrupt it for others.</li>
  <li>Do not upload unlawful content or content you do not have the right to submit.</li>
</ul>

<h2>Plans and payment</h2>
<p>Calgym is offered as subscriptions: Essentials (Food or Training, plus Health) and Pro (Food, Training and Health), each with a monthly allowance of AI actions. New subscribers may start with a free trial, which includes every feature whichever plan follows it; unless cancelled at least 24 hours before the trial ends, the subscription then begins and is charged. The trial's length and the price that follows are shown before you start it. Without a subscription you can still view and export what you recorded. Subscriptions are billed through the Apple App Store or Google Play. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel your subscription in your App Store or Google Play account settings. A move to a lower plan takes effect when the current period or trial ends; a move to a higher plan takes effect at once, and the store credits what is left of the lower one. Refunds are handled by Apple or Google under their policies.</p>

<h2>Promotion codes</h2>
<p>A code can be used once per account, only while it is active and within its dates and limits, and may be withdrawn at any time. A free-access code gives the stated plan for the stated period at no charge. A discount code applies the store's own offer at checkout; the price and its terms are the ones the App Store or Google Play shows you. Codes have no cash value.</p>

<h2>Your content and data</h2>
<p>Your logged data belongs to you. You can export or delete it at any time from Profile. AI features send what you give them to our AI providers, with your permission; see our <a href="/privacy">Privacy Policy</a> for details.</p>

<h2>Limitation of liability</h2>
<p>To the maximum extent permitted by law, Calgym is not liable for any indirect or consequential loss, or for decisions made in reliance on AI estimates.</p>

<h2>Contact</h2>
<p><a href="mailto:${CONTACT}">${CONTACT}</a></p>

<hr />

<div class="ar">
<h1>شروط الاستخدام</h1>
<div class="updated">كالجيم · آخر تحديث ${UPDATED_AR}</div>
<p>باستخدامك كالجيم فإنك توافق على هذه الشروط.</p>

<h2>الخدمة</h2>
<p>كالجيم تطبيق لتتبع السعرات والتمارين بمساعدة الذكاء الاصطناعي، ويُقدَّم «كما هو» دون ضمانات، وقد نغيّر المزايا أو نوقفها.</p>

<h2>ليست نصيحة طبية</h2>
<p>أرقام السعرات والعناصر الغذائية تقديرات قد تكون خاطئة. لا يقدّم كالجيم تشخيصاً أو علاجاً أو نصيحة طبية أو غذائية. استشر مختصاً قبل اتخاذ قرارات صحية.</p>

<h2>الباقات والدفع</h2>
<p>يُقدَّم كالجيم باشتراكات: الأساسيات (التغذية أو التمارين، مع الصحة) وبرو (التغذية والتمارين والصحة)، ولكل منهما حد شهري من عمليات الذكاء الاصطناعي. قد يبدأ المشتركون الجدد بتجربة مجانية تشمل كل المزايا أياً كانت الخطة التي تليها؛ وما لم تُلغَ قبل ٢٤ ساعة على الأقل من نهايتها يبدأ الاشتراك ويُحتسب. تُعرض مدة التجربة والسعر الذي يليها قبل أن تبدأها. وبدون اشتراك يمكنك الاطلاع على ما سجّلته وتصديره. تتم الفوترة عبر App Store أو Google Play، وتتجدد الاشتراكات تلقائياً ما لم تُلغَ قبل ٢٤ ساعة من نهاية الفترة. يمكنك الإدارة أو الإلغاء من إعدادات حسابك في المتجر. الانتقال إلى خطة أقل يسري عند نهاية الفترة أو التجربة الحالية، والانتقال إلى خطة أعلى يسري فوراً ويحتسب المتجر المتبقي من الخطة الأقل.</p>

<h2>أكواد العروض</h2>
<p>يُستخدم الكود مرة واحدة لكل حساب، ما دام فعّالاً وضمن تواريخه وحدوده، ويجوز سحبه في أي وقت. كود الوصول المجاني يمنح الباقة المذكورة للمدة المذكورة دون مقابل، وكود الخصم يطبّق عرض المتجر نفسه عند الدفع بالسعر والشروط التي يعرضها App Store أو Google Play. لا قيمة نقدية للأكواد.</p>

<h2>بياناتك</h2>
<p>بياناتك ملكك، ويمكنك تصديرها أو حذفها في أي وقت من الملف الشخصي.</p>

<h2>للتواصل</h2>
<p><a href="mailto:${CONTACT}">${CONTACT}</a></p>
</div>`,
);

export const SUPPORT_HTML = page(
  'Support',
  `<h1>Calgym Support</h1>
<div class="updated">We usually reply within two working days.</div>

<p>Write to <a href="mailto:${CONTACT}">${CONTACT}</a>. Telling us your phone model and what you tapped helps us answer faster.</p>

<h2>Membership and billing</h2>
<ul>
  <li><strong>Cancel or change a subscription:</strong> iPhone — Settings → your name → Subscriptions → Calgym. Android — Google Play → Profile → Payments &amp; subscriptions → Subscriptions.</li>
  <li><strong>Moved to a new phone?</strong> Open Calgym → Profile → Membership → Restore purchases.</li>
  <li><strong>Refunds</strong> are decided by Apple (<a href="https://reportaproblem.apple.com">reportaproblem.apple.com</a>) or Google Play under their policies.</li>
  <li><strong>Have a code?</strong> Profile → Settings → Redeem a code.</li>
</ul>

<h2>Your data</h2>
<ul>
  <li><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Use</a></li>
  <li><a href="/account-deletion">Delete your account</a> — in the app or from this page.</li>
  <li>Turn AI processing on or off: Profile → Settings → Privacy &amp; data → AI processing.</li>
</ul>

<h2>About the numbers</h2>
<p>Calories and nutrition are AI estimates and can be wrong. Calgym gives general guidance, not medical advice.</p>

<hr />

<div class="ar">
<h1>دعم كالجيم</h1>
<div class="updated">نرد عادة خلال يومي عمل.</div>
<p>راسلنا على <a href="mailto:${CONTACT}">${CONTACT}</a>، وذكرُ طراز هاتفك وما ضغطت عليه يساعدنا على الرد أسرع.</p>

<h2>العضوية والفوترة</h2>
<ul>
  <li><strong>إلغاء الاشتراك أو تغييره:</strong> في iPhone — الإعدادات ← اسمك ← الاشتراكات ← كالجيم. وفي Android — Google Play ← الملف الشخصي ← المدفوعات والاشتراكات ← الاشتراكات.</li>
  <li><strong>انتقلت إلى هاتف جديد؟</strong> افتح كالجيم ← الملف الشخصي ← العضوية ← استعادة المشتريات.</li>
  <li><strong>الاسترداد</strong> تقرّره Apple أو Google Play وفق سياساتهما.</li>
  <li><strong>لديك كود؟</strong> الملف الشخصي ← الإعدادات ← استخدام كود.</li>
</ul>

<h2>بياناتك</h2>
<ul>
  <li><a href="/privacy">سياسة الخصوصية</a> · <a href="/terms">شروط الاستخدام</a></li>
  <li><a href="/account-deletion">حذف حسابك</a> — من التطبيق أو من هذه الصفحة.</li>
  <li>تشغيل المعالجة بالذكاء الاصطناعي أو إيقافها: الملف الشخصي ← الإعدادات ← الخصوصية والبيانات.</li>
</ul>
</div>`,
);

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/**
 * How to delete a Calgym account — Google Play asks for a web page that does
 * this without the app. In the app it is immediate; here it is a request the
 * team completes (it appears in the admin console) within 30 days.
 */
export function accountDeletionHtml(state: 'form' | 'sent' | 'invalid' = 'form', email = ''): string {
  const form = `<form method="post" action="/account-deletion" style="margin-top:12px">
    <label for="email" style="display:block;font-weight:600;margin-bottom:4px">Email on the account · البريد المرتبط بالحساب</label>
    <input id="email" name="email" type="email" required maxlength="200" value="${escHtml(email)}" autocomplete="email"
      style="width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-size:15px;background:var(--card);color:var(--text)" />
    <label for="note" style="display:block;font-weight:600;margin:10px 0 4px">Anything we should know (optional) · ملاحظات (اختياري)</label>
    <textarea id="note" name="note" maxlength="500" rows="3"
      style="width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-size:15px;background:var(--card);color:var(--text)"></textarea>
    <input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true" />
    <button type="submit" style="margin-top:12px;background:var(--primary);color:#fff;border:0;border-radius:10px;padding:11px 18px;font-weight:700;font-size:15px;cursor:pointer">Request deletion · طلب الحذف</button>
  </form>`;
  const banner =
    state === 'sent'
      ? `<p style="background:#E3F4EA;color:#1E6B45;padding:12px 14px;border-radius:10px"><strong>Request received.</strong> We will delete the account for that address within 30 days and confirm by email. · <strong>تم استلام الطلب.</strong> سنحذف الحساب المرتبط بهذا البريد خلال ٣٠ يوماً ونؤكد ذلك بالبريد.</p>`
      : state === 'invalid'
        ? `<p style="background:#FBE9E7;color:#9B2C1E;padding:12px 14px;border-radius:10px">Please enter the email address on your account. · يرجى إدخال البريد المرتبط بحسابك.</p>`
        : '';
  return page(
    'Delete your account',
    `<h1>Delete your Calgym account</h1>
<div class="updated">Calgym · account deletion</div>
${banner}
<h2>Fastest: in the app</h2>
<p>Open Calgym → Profile → Settings → Privacy &amp; data → <strong>Delete my account</strong>. It happens at once: the data on your phone, your cloud backup, your sign-in account and every record on our server linked to you are deleted. It cannot be undone.</p>

<h2>Without the app</h2>
<p>Send a request below with the email address you signed in with. We delete the same things within 30 days and confirm by email. Guests (no account) can delete everything simply by deleting the app — nothing personal is kept about them.</p>
${state === 'sent' ? '' : form}

<h2>What is kept</h2>
<p>Records of purchases and partner commissions are kept for accounting, with nothing that identifies you. Subscriptions are billed by Apple or Google: cancel yours in your store settings — deleting the account does not cancel it.</p>

<hr />

<div class="ar">
<h1>حذف حساب كالجيم</h1>
<h2>الأسرع: من التطبيق</h2>
<p>افتح كالجيم ← الملف الشخصي ← الإعدادات ← الخصوصية والبيانات ← <strong>حذف حسابي</strong>. يتم الحذف فوراً: بيانات هاتفك ونسختك الاحتياطية وحساب الدخول وكل سجل مرتبط بك على خادمنا. ولا يمكن التراجع عنه.</p>
<h2>دون التطبيق</h2>
<p>أرسل طلباً من النموذج أعلاه بالبريد الذي سجّلت الدخول به، وسنحذف الأشياء نفسها خلال ٣٠ يوماً ونؤكد ذلك بالبريد. أما الضيوف (دون حساب) فيكفيهم حذف التطبيق.</p>
<h2>ما يُحتفظ به</h2>
<p>سجلات المشتريات وعمولات الشركاء لأغراض محاسبية، دون أي شيء يعرّف بك. الاشتراكات تُفوتر عبر Apple أو Google، فألغِ اشتراكك من إعدادات المتجر — حذف الحساب لا يلغيه.</p>
</div>`,
  );
}

/** Screenshots of the WHOOP integration, in the order the page shows them. */
export const WHOOP_SHOTS: { file: string; title: string; caption: string }[] = [
  { file: '05-connections.jpg', title: 'Connect', caption: 'Health → Connections. WHOOP connects through WHOOP’s own OAuth sign-in and shows its real state. Tapping it again disconnects, which revokes access at WHOOP.' },
  { file: '07-opt-in.jpg', title: 'Explicit opt-in for AI Support', caption: 'Right after connecting, one question: may AI Support use recovery, sleep and strain? “Not now” keeps it off. Ships in the update that follows our App Store approval.' },
  { file: '03-training-whoop.jpg', title: 'Real calories burned', caption: 'Training tab. The day’s burn comes from WHOOP (“From WHOOP”, with sync time) and is split across the logged exercises, replacing our estimate.' },
  { file: '01-overview.jpg', title: 'Overview', caption: 'The WHOOP burn feeds the day’s summary next to what was eaten.' },
  { file: '04-history.jpg', title: 'Workout history', caption: 'Past sessions carry WHOOP’s calories, marked with a watch icon so it is clear where the figure came from.' },
  { file: '06-shared-context.jpg', title: 'Member control', caption: 'Profile → Settings → Privacy & data → Manage shared context. The WHOOP data switch decides whether AI Support may see recovery, sleep and strain. It starts off; shown here after the member allowed it.' },
];

export const WHOOP_INTEGRATION_HTML = page(
  'WHOOP integration',
  `<style>
  .wrap { max-width:1040px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:22px; margin-top:18px; }
  figure { margin:0; }
  figure img { width:100%; border-radius:22px; border:1px solid var(--line); display:block; }
  figcaption { font-size:14px; color:var(--muted); margin-top:8px; }
  figcaption b { display:block; color:var(--text); font-size:15px; }
</style>
<h1>Calgym × WHOOP</h1>
<div class="updated">How Calgym uses WHOOP data · ${UPDATED}</div>
<p>Calgym is a food and training tracker for iPhone and Android, in English and Arabic. Members can connect WHOOP so the calories they really burned replace our estimates, and — only if they allow it — so the AI coach can take their recovery, sleep and strain into account.</p>
<h2>What we read, and why</h2>
<ul>
  <li><strong>Workouts</strong> (read:workout): calories burned, strain and time, shown in the Training and Overview tabs and in workout history.</li>
  <li><strong>Recovery, sleep, cycles</strong> (read:recovery, read:sleep, read:cycles): sent to the AI coach with a question only when the member has allowed it.</li>
  <li><strong>offline</strong>: a refresh token, so members are not asked to reconnect every hour.</li>
</ul>
<h2>How the data is handled</h2>
<ul>
  <li>Our server stores only the OAuth tokens. WHOOP figures are kept on the member’s phone and in their own private backup.</li>
  <li>AI requests with WHOOP data go to Anthropic (Claude) only, never to another provider, and are not used to train models.</li>
  <li>We never sell WHOOP data or share it with anyone else.</li>
  <li>Disconnecting calls WHOOP’s revoke endpoint, deletes the tokens and clears WHOOP data from the phone and backup. Deleting the account does the same.</li>
</ul>
<p>Privacy policy: <a href="/privacy">/privacy</a> (see the WHOOP section) · Contact: <a href="mailto:${CONTACT}">${CONTACT}</a></p>
<h2>Screens</h2>
<p style="color:var(--muted);font-size:14px">From the app with sample data.</p>
<div class="grid">
${WHOOP_SHOTS.map((s) => `<figure><img src="/whoop/img/${s.file}" alt="${s.title}" loading="lazy" /><figcaption><b>${s.title}</b>${s.caption}</figcaption></figure>`).join('\n')}
</div>`,
);
