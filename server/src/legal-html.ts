/**
 * Privacy policy and terms, served as public pages. App Store Connect and the
 * Play Console both require a reachable privacy-policy URL, and the app links
 * to these from Profile → Legal.
 *
 * Keep these accurate: they describe what the app actually does today.
 */
const CONTACT = process.env.SUPPORT_EMAIL ?? 'augaishb1@gmail.com';
const UPDATED = 'July 2026';

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

<p>Calgym helps you track meals and workouts. This policy explains what we collect and why. We keep it short because we collect very little.</p>

<h2>What stays on your device</h2>
<p>Your logged data — profile details, meals, workouts, water, weight and your weekly schedule — is stored locally on your phone. It is not uploaded to us or shared with anyone.</p>

<h2>What is sent to our servers</h2>
<ul>
  <li><strong>AI analysis requests.</strong> When you scan a meal, scan gym equipment, describe a meal in words, or message the AI coach, that content (a photo or your text) is sent to our server and forwarded to our AI provider, Anthropic, to generate the result. We do not store your photos or messages after the response is returned.</li>
  <li><strong>Coach context.</strong> If you use the AI coach, a short summary of your recent totals (calories, macros, workouts) is included so the answer can reference your own data. It is used only to produce that reply and is not stored.</li>
  <li><strong>An anonymous installation ID.</strong> A random identifier generated on your device. It is not linked to your name, email, phone number or advertising ID. We use it only to count how many AI actions you have used in the current month, so we can apply plan limits.</li>
</ul>

<h2>What we do not do</h2>
<ul>
  <li>We do not sell or rent your data.</li>
  <li>We do not use third-party advertising or tracking networks.</li>
  <li>We do not build advertising profiles about you.</li>
  <li>Any sponsor shown in the app is a fixed placement; it does not receive your data and does not track you.</li>
</ul>

<h2>Barcode lookups</h2>
<p>Scanning a barcode queries <a href="https://world.openfoodfacts.org">Open Food Facts</a>, a free public food database. Only the barcode number is sent.</p>

<h2>Your choices</h2>
<ul>
  <li><strong>Export.</strong> Profile → Export my data gives you a copy of everything stored on your device.</li>
  <li><strong>Delete.</strong> Profile → Delete my account erases the data on your device and deletes your usage records from our server. This cannot be undone.</li>
</ul>

<h2>Children</h2>
<p>Calgym is not directed to children under 13, and we do not knowingly collect their data.</p>

<h2>Health disclaimer</h2>
<p>Calorie and nutrition figures are AI estimates and can be inaccurate. Calgym provides general guidance, not medical advice. Consult a qualified professional for medical or dietary decisions.</p>

<h2>Contact</h2>
<p>Questions or requests: <a href="mailto:${CONTACT}">${CONTACT}</a></p>

<hr />

<div class="ar">
<h1>سياسة الخصوصية</h1>
<div class="updated">كالجيم · آخر تحديث ${UPDATED}</div>
<p>يساعدك كالجيم على تتبع وجباتك وتمارينك. نجمع القليل جداً من البيانات.</p>

<h2>ما يبقى على جهازك</h2>
<p>بياناتك المسجّلة — ملفك الشخصي والوجبات والتمارين والماء والوزن وجدولك الأسبوعي — تُحفظ محلياً على هاتفك ولا تُرفع إلينا.</p>

<h2>ما يُرسل إلى خوادمنا</h2>
<ul>
  <li><strong>طلبات التحليل بالذكاء الاصطناعي:</strong> عند مسح وجبة أو جهاز، أو وصف وجبة، أو مراسلة المدرب الذكي، يُرسل المحتوى إلى خادمنا ثم إلى مزوّد الذكاء الاصطناعي (Anthropic) لإنتاج النتيجة. لا نحتفظ بصورك أو رسائلك بعد إرجاع النتيجة.</li>
  <li><strong>ملخّص للمدرب:</strong> عند استخدام المدرب الذكي يُرفق ملخص قصير لإجمالياتك الأخيرة ليكون الرد مخصصاً لك، ولا يُخزَّن.</li>
  <li><strong>معرّف تثبيت مجهول:</strong> رقم عشوائي يُنشأ على جهازك، غير مرتبط باسمك أو بريدك أو رقمك، ونستخدمه فقط لعدّ عمليات الذكاء الاصطناعي خلال الشهر لتطبيق حدود الباقة.</li>
</ul>

<h2>ما لا نفعله</h2>
<ul>
  <li>لا نبيع بياناتك ولا نؤجّرها.</li>
  <li>لا نستخدم شبكات إعلانات أو تتبّع خارجية.</li>
  <li>أي راعٍ يظهر في التطبيق هو مساحة ثابتة لا تتلقى بياناتك ولا تتعقبك.</li>
</ul>

<h2>خياراتك</h2>
<ul>
  <li><strong>التصدير:</strong> الملف الشخصي ← تصدير بياناتي.</li>
  <li><strong>الحذف:</strong> الملف الشخصي ← حذف حسابي، ويمسح بيانات جهازك وسجلات الاستخدام لدينا نهائياً.</li>
</ul>

<h2>إخلاء مسؤولية صحية</h2>
<p>أرقام السعرات تقديرية وقد تكون غير دقيقة، وهي إرشادية وليست نصيحة طبية.</p>

<h2>للتواصل</h2>
<p><a href="mailto:${CONTACT}">${CONTACT}</a></p>
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
<p>Calgym offers a free tier with a monthly allowance of AI actions, and paid subscriptions with larger allowances. Paid subscriptions are billed through the Apple App Store or Google Play. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel your subscription in your App Store or Google Play account settings. Refunds are handled by Apple or Google under their policies.</p>

<h2>Your content and data</h2>
<p>Your logged data belongs to you. You can export or delete it at any time from Profile. See our Privacy Policy for details.</p>

<h2>Limitation of liability</h2>
<p>To the maximum extent permitted by law, Calgym is not liable for any indirect or consequential loss, or for decisions made in reliance on AI estimates.</p>

<h2>Contact</h2>
<p><a href="mailto:${CONTACT}">${CONTACT}</a></p>

<hr />

<div class="ar">
<h1>شروط الاستخدام</h1>
<div class="updated">كالجيم · آخر تحديث ${UPDATED}</div>
<p>باستخدامك كالجيم فإنك توافق على هذه الشروط.</p>

<h2>الخدمة</h2>
<p>كالجيم تطبيق لتتبع السعرات والتمارين بمساعدة الذكاء الاصطناعي، ويُقدَّم «كما هو» دون ضمانات، وقد نغيّر المزايا أو نوقفها.</p>

<h2>ليست نصيحة طبية</h2>
<p>أرقام السعرات والعناصر الغذائية تقديرات قد تكون خاطئة. لا يقدّم كالجيم تشخيصاً أو علاجاً أو نصيحة طبية أو غذائية. استشر مختصاً قبل اتخاذ قرارات صحية.</p>

<h2>الباقات والدفع</h2>
<p>تتوفر باقة مجانية بحد شهري من عمليات الذكاء الاصطناعي، وباقات مدفوعة بحدود أعلى. تتم الفوترة عبر App Store أو Google Play، وتتجدد الاشتراكات تلقائياً ما لم تُلغَ قبل ٢٤ ساعة من نهاية الفترة. يمكنك الإدارة أو الإلغاء من إعدادات حسابك في المتجر.</p>

<h2>بياناتك</h2>
<p>بياناتك ملكك، ويمكنك تصديرها أو حذفها في أي وقت من الملف الشخصي.</p>

<h2>للتواصل</h2>
<p><a href="mailto:${CONTACT}">${CONTACT}</a></p>
</div>`,
);
