/**
 * Calgym admin dashboard — a single self-contained page served at /admin.
 * The admin token is entered in the browser and kept in sessionStorage; it is
 * never baked into this file.
 */
export const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Calgym Admin</title>
<style>
  :root { --bg:#F5F3FA; --card:#fff; --text:#2A2440; --muted:#6B6480; --line:#E6E1F0;
          --primary:#6D5AAB; --green:#7FB89B; --danger:#E5574E; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#17141F; --card:#221D2E; --text:#F2EFF8; --muted:#A69FBA; --line:#332C44; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; padding:20px; }
  .wrap { max-width:1000px; margin:0 auto; }
  h1 { font-size:22px; margin:0 0 4px; }
  .sub { color:var(--muted); font-size:14px; margin-bottom:20px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px;
    padding:16px; margin-bottom:16px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px; }
  .stat b { display:block; font-size:26px; }
  .stat span { color:var(--muted); font-size:13px; }
  label { display:block; font-size:13px; color:var(--muted); margin:8px 0 4px; }
  input, select { width:100%; padding:9px 11px; border:1px solid var(--line); border-radius:9px;
    background:var(--bg); color:var(--text); font-size:14px; }
  button { background:var(--primary); color:#fff; border:0; border-radius:9px;
    padding:10px 16px; font-weight:700; cursor:pointer; font-size:14px; }
  button.ghost { background:transparent; color:var(--primary); border:1px solid var(--primary); }
  .row { display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; }
  .row > div { flex:1; min-width:120px; }
  .scroll { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; font-size:13px; min-width:640px; }
  th, td { text-align:start; padding:8px 6px; border-bottom:1px solid var(--line); }
  th { color:var(--muted); font-weight:600; }
  .pill { display:inline-block; padding:2px 9px; border-radius:99px; font-size:12px; font-weight:700; }
  .pro { background:rgba(127,184,155,.22); color:#3E8B69; }
  .free { background:var(--line); color:var(--muted); }
  .muted { color:var(--muted); }
  .err { color:var(--danger); font-size:13px; margin-top:8px; }
  .hide { display:none; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Calgym Admin</h1>
  <div class="sub">Subscriptions, AI usage and the sponsor slot.</div>

  <div class="card" id="auth">
    <label>Admin token</label>
    <div class="row">
      <div><input id="token" type="password" placeholder="ADMIN_TOKEN" /></div>
      <button onclick="load()">Sign in</button>
    </div>
    <div class="err hide" id="autherr">Wrong token, or ADMIN_TOKEN is not set on the server.</div>
  </div>

  <div id="app" class="hide">
    <div class="grid" style="margin-bottom:16px">
      <div class="stat"><b id="s_users">0</b><span>Total users</span></div>
      <div class="stat"><b id="s_pro">0</b><span>Pro users</span></div>
      <div class="stat"><b id="s_active">0</b><span>Active this month</span></div>
      <div class="stat"><b id="s_actions">0</b><span>AI actions this month</span></div>
      <div class="stat"><b id="s_mrr">0</b><span>MRR (SAR, est.)</span></div>
      <div class="stat"><b id="s_cost">0</b><span>AI cost (SAR, est.)</span></div>
    </div>

    <div class="card">
      <b>Monthly AI allowance</b>
      <div class="row">
        <div><label>Free</label><input id="lim_free" type="number" min="0" /></div>
        <div><label>Pro</label><input id="lim_pro" type="number" min="0" /></div>
        <div><label>Pro+</label><input id="lim_proplus" type="number" min="0" /></div>
        <button onclick="saveLimits()">Save</button>
      </div>
      <div class="sub" style="margin:10px 0 0">Every AI action counts: meal photo, describe, equipment and each coach message.</div>
    </div>

    <div class="card">
      <b>Grant or revoke Pro</b>
      <div class="row">
        <div><label>User ref</label><input id="g_ref" placeholder="paste from the table" /></div>
        <div><label>Days (blank = forever)</label><input id="g_days" type="number" min="1" /></div>
        <div><label>Note</label><input id="g_note" placeholder="e.g. beta tester" /></div>
      </div>
      <div class="row" style="margin-top:10px">
        <button onclick="setPlan('pro')">Grant Pro</button>
        <button onclick="setPlan('proPlus')">Grant Pro+</button>
        <button class="ghost" onclick="setPlan('free')">Revoke</button>
      </div>
    </div>

    <div class="card">
      <b>Sponsor slot</b>
      <div class="sub" style="margin:4px 0 0">The in-app spot you rent to a real advertiser. Leave disabled to hide it.</div>
      <div class="row">
        <div><label>Title</label><input id="sp_title" /></div>
        <div><label>Subtitle</label><input id="sp_sub" /></div>
      </div>
      <div class="row">
        <div><label>Image URL (https)</label><input id="sp_img" /></div>
        <div><label>Link URL (https)</label><input id="sp_link" /></div>
      </div>
      <div class="row" style="margin-top:10px">
        <label style="margin:0"><input id="sp_on" type="checkbox" style="width:auto" /> Enabled</label>
        <button onclick="saveSponsor()">Save sponsor</button>
      </div>
    </div>

    <div class="card">
      <b>AI provider by membership</b>
      <div class="sub" style="margin:4px 0 10px">Which model answers for each tier: meal photo scans, described meals, "refine" edits, exercise info and equipment scans. Takes effect on the next request — no redeploy. Claude stays fully configured either way; it simply isn't called for a tier set to DeepSeek, so it stops costing you anything there.</div>
      <div class="row">
        <div><label>Free</label>
          <select id="prov_free"><option value="deepseek">DeepSeek</option><option value="claude">Claude</option></select>
        </div>
        <div><label>Pro</label>
          <select id="prov_pro"><option value="deepseek">DeepSeek</option><option value="claude">Claude</option></select>
        </div>
        <div><label>Pro+</label>
          <select id="prov_proPlus"><option value="deepseek">DeepSeek</option><option value="claude">Claude</option></select>
        </div>
        <button onclick="saveProviders()">Save providers</button>
      </div>
      <div id="prov_msg" class="sub hide" style="margin-top:8px"></div>
      <div class="sub" id="prov_warn" style="margin-top:8px"></div>
      <div class="sub" style="margin-top:10px"><b>Always Claude, whatever is set above:</b></div>
      <div class="sub" id="prov_fixed"></div>
    </div>

    <div class="card">
      <b>Membership prices</b>
      <div class="sub" style="margin:4px 0 10px">What the app's upgrade screen shows, and what the revenue estimate above is based on. <b>This does not change what anyone is actually charged</b> — the real amount comes from the product price in App Store Connect / Google Play (mirrored by RevenueCat). Change it there first, then set the same number here so the two agree.</div>
      <div class="row">
        <div><label>Pro / month</label><input id="pr_pro" type="number" step="0.01" /></div>
        <div><label>Pro+ / month</label><input id="pr_proplus" type="number" step="0.01" /></div>
        <div><label>Pro / year</label><input id="pr_proyear" type="number" step="0.01" /></div>
        <div><label>Currency</label><input id="pr_cur" maxlength="8" /></div>
        <button onclick="savePrices()">Save prices</button>
      </div>
      <div id="pr_msg" class="sub hide" style="margin-top:8px"></div>
    </div>

    <div class="card" id="shadowcard">
      <b>DeepSeek shadow test — meal scans</b>
      <div class="sub" style="margin:4px 0 10px">Runs only for scans from a tier still set to Claude above: that scan is answered by Claude, and the same photo also goes to DeepSeek in the background and is logged here side by side. A tier already on DeepSeek has nothing to compare, so it makes no shadow call. Empty if <code>DEEPSEEK_API_KEY</code> isn't set on the server.</div>
      <div class="row" style="margin-bottom:10px">
        <button class="ghost" onclick="testDeepseekVision()">Test DeepSeek vision now</button>
      </div>
      <div id="dstest" class="sub hide"></div>
      <div class="scroll">
        <table>
          <thead><tr><th>Time</th><th>Ref</th><th>Claude — item, kcal, P/C/F</th><th>DeepSeek — item, kcal, P/C/F</th><th>DeepSeek cost (SAR)</th></tr></thead>
          <tbody id="shadowrows"></tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <b>Report test — DeepSeek vs Claude on a real report</b>
      <div class="sub" style="margin:4px 0 10px">Body readings are the one job still pinned to Claude, on the assumption that DeepSeek's image detail is too coarse to transcribe a printed table of numbers. This settles it: pick a real InBody/Tanita/DEXA report and both providers read it with the identical prompt the live route uses, shown field by field below. A photo or screenshot compares both; a PDF runs Claude only, since our DeepSeek client sends images. <b>This spends on both providers</b> — that is the point — and uses nobody's monthly allowance.</div>
      <div class="row" style="margin-bottom:10px">
        <div><label>Report file (image or PDF)</label><input id="rep_file" type="file" accept="image/*,application/pdf" /></div>
        <button class="ghost" onclick="testReport()">Run report test</button>
      </div>
      <div id="rep_msg" class="sub hide"></div>
      <div class="scroll hide" id="rep_wrap">
        <table>
          <thead><tr><th>Field</th><th>Claude</th><th>DeepSeek</th><th>Match</th></tr></thead>
          <tbody id="rep_rows"></tbody>
        </table>
      </div>
      <div id="rep_raw" class="sub hide" style="margin-top:8px"></div>
    </div>

    <div class="card">
      <b>DeepSeek connection test</b>
      <div class="sub" style="margin:4px 0 10px">Fires one real DeepSeek text call (an exercise-info lookup) so you can confirm the key works and the model is answering, without spending a user's scan on it. Worth running right after changing any tier to DeepSeek above.</div>
      <div class="row" style="margin-bottom:10px">
        <button class="ghost" onclick="testDeepseekText()">Test DeepSeek text now</button>
      </div>
      <div id="dstest2" class="sub hide"></div>
    </div>

    <div class="card">
      <b>Users</b>
      <div class="err hide" id="rowerr"></div>
      <div class="sub" style="margin:4px 0 10px">"Tokens"/"Cost" are real, tracked from 9/2/2026 onward. "Historical" is a rough per-kind-weighted guess for all-time usage before that (coach and web-search-backed calls cost more than a plain photo scan) — for a sense of scale only, not real data, and won't reconcile exactly against your Anthropic Console bill.</div>
      <div class="scroll">
        <table>
          <thead><tr><th>Ref</th><th>Email</th><th>Device</th><th>Plan</th><th>Source</th><th>Used</th><th>Tokens</th><th>Cost (SAR)</th><th>Historical (est. SAR)</th><th>Note</th><th>Last seen</th><th></th></tr></thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<script>
  // Pricing/conversion assumptions used only for the on-screen estimates —
  // the actual AI cost figures (both "Cost", real, and "Historical", a
  // per-kind-weighted guess — see HISTORICAL_COST_PER_ACTION_USD in
  // pricing.ts) come from the server; this just converts USD to SAR.
  var STORE_CUT = 0.15, USD_TO_SAR = 3.75;
  /** The monthly price the revenue estimate multiplies by — whatever is set
   * in "Membership prices" below, falling back to the original 13. */
  function monthlyPrice() {
    var p = (data && data.prices) || {};
    return typeof p.pro === 'number' ? p.pro : 13;
  }
  var data = null;
  function tok() { return document.getElementById('token').value || sessionStorage.getItem('ct') || ''; }
  function api(path, body) {
    return fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-admin-token': tok(), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function load() {
    api('/admin/api/data').then(function (d) {
      sessionStorage.setItem('ct', tok());
      data = d;
      document.getElementById('auth').classList.add('hide');
      document.getElementById('app').classList.remove('hide');
      render();
    }).catch(function () { document.getElementById('autherr').classList.remove('hide'); });
  }
  function render() {
    var s = data.stats;
    document.getElementById('s_users').textContent = s.totalUsers;
    document.getElementById('s_pro').textContent = s.proUsers;
    document.getElementById('s_active').textContent = s.activeThisMonth;
    document.getElementById('s_actions').textContent = s.actionsThisMonth;
    document.getElementById('s_mrr').textContent =
      Math.round(s.proUsers * monthlyPrice() * (1 - STORE_CUT));
    document.getElementById('s_cost').textContent =
      (s.costUsdThisMonth * USD_TO_SAR).toFixed(2);
    document.getElementById('lim_free').value = data.limits.free;
    document.getElementById('lim_pro').value = data.limits.pro;
    document.getElementById('lim_proplus').value = data.limits.proPlus;
    var sp = data.sponsor || {};
    document.getElementById('sp_title').value = sp.title || '';
    document.getElementById('sp_sub').value = sp.subtitle || '';
    document.getElementById('sp_img').value = sp.imageUrl || '';
    document.getElementById('sp_link').value = sp.linkUrl || '';
    document.getElementById('sp_on').checked = !!sp.enabled;
    renderProviders();
    renderPrices();
    renderShadow();

    // The table can only ever show what listUsers() returned in one response;
    // when that is fewer than the true total, say so instead of leaving a
    // silent gap that reads as "some users are missing".
    var rowerr = document.getElementById('rowerr');
    if (data.users.length < s.totalUsers) {
      rowerr.textContent = 'Showing ' + data.users.length + ' of ' + s.totalUsers + ' users — the oldest, least-recently-active ones are cut off. Raise the limit on the server if you need to see them.';
      rowerr.classList.remove('hide');
    } else {
      rowerr.classList.add('hide');
    }

    var html = '';
    data.users.forEach(function (u) {
      var isPro = u.plan === 'pro' || u.plan === 'proPlus';
      html += '<tr>' +
        '<td style="font-family:monospace">' + esc(u.ref) + '</td>' +
        '<td>' + (u.email ? esc(u.email) : '<span class="muted">guest</span>') + '</td>' +
        '<td class="muted">' + (u.device ? esc(u.device) : '—') + '</td>' +
        '<td><span class="pill ' + (isPro ? 'pro' : 'free') + '">' + u.plan + '</span></td>' +
        '<td class="muted">' + esc(u.planSource) + '</td>' +
        '<td>' + u.used + '</td>' +
        '<td class="muted">' + fmtTokens(u.tokens) + '</td>' +
        '<td class="muted">' + (u.costUsd * USD_TO_SAR).toFixed(3) + '</td>' +
        '<td class="muted">' + (u.histCostUsd * USD_TO_SAR).toFixed(2) + '</td>' +
        '<td class="muted">' + esc(u.note || '') + '</td>' +
        '<td class="muted">' + new Date(u.lastSeenAt).toLocaleDateString() + '</td>' +
        '<td><button class="ghost" onclick="pick(\\'' + esc(u.ref) + '\\')">Select</button></td>' +
        '</tr>';
    });
    document.getElementById('rows').innerHTML = html || '<tr><td colspan="12" class="muted">No users yet.</td></tr>';
  }
  var PLAN_IDS = ['free', 'pro', 'proPlus'];
  function renderProviders() {
    var p = data.providers || {};
    PLAN_IDS.forEach(function (id) {
      document.getElementById('prov_' + id).value = p[id] || 'claude';
    });
    var warn = document.getElementById('prov_warn');
    if (!data.deepseekConfigured) {
      warn.innerHTML = '<span style="color:var(--danger)">DEEPSEEK_API_KEY is not set on the server — everything runs on Claude until it is.</span>';
    } else if (p.proPlus === 'deepseek') {
      // The app sells Pro+ on "highest-accuracy meal analysis"; that claim
      // is about Claude's stronger model, so flag the mismatch rather than
      // letting the store listing quietly stop being true.
      warn.innerHTML = '<span style="color:var(--danger)">Note: the app advertises Pro+ as "highest-accuracy meal analysis". With Pro+ on DeepSeek it gets the same model as Free — either put Pro+ back on Claude or reword that line.</span>';
    } else {
      warn.textContent = '';
    }
    document.getElementById('prov_fixed').innerHTML = (data.fixedRoutes || []).map(function (f) {
      return '• <b>' + esc(f.route) + '</b> — ' + esc(f.reason);
    }).join('<br>');
  }
  function saveProviders() {
    var box = document.getElementById('prov_msg');
    box.classList.remove('hide');
    box.textContent = 'Saving…';
    var body = {};
    PLAN_IDS.forEach(function (id) { body[id] = document.getElementById('prov_' + id).value; });
    api('/admin/api/providers', body).then(function (r) {
      if (r.error) { box.textContent = 'Error: ' + (r.error === 'not_configured' ? 'DEEPSEEK_API_KEY is not set on the server.' : r.error); return; }
      data.providers = r.providers;
      renderProviders();
      box.textContent = 'Saved. Free: ' + r.providers.free + ' · Pro: ' + r.providers.pro + ' · Pro+: ' + r.providers.proPlus + '.';
    }).catch(function (e) { box.textContent = 'Request failed: ' + e; });
  }
  function renderPrices() {
    var p = data.prices || {};
    document.getElementById('pr_pro').value = p.pro != null ? p.pro : '';
    document.getElementById('pr_proplus').value = p.proPlus != null ? p.proPlus : '';
    document.getElementById('pr_proyear').value = p.proYearly != null ? p.proYearly : '';
    document.getElementById('pr_cur').value = p.currency || 'SAR';
  }
  function savePrices() {
    var box = document.getElementById('pr_msg');
    box.classList.remove('hide');
    box.textContent = 'Saving…';
    api('/admin/api/prices', {
      pro: Number(document.getElementById('pr_pro').value),
      proPlus: Number(document.getElementById('pr_proplus').value),
      proYearly: Number(document.getElementById('pr_proyear').value),
      currency: document.getElementById('pr_cur').value,
    }).then(function (r) {
      if (r.error) { box.textContent = 'Error: ' + r.error + ' (prices must be numbers, 0 or more)'; return; }
      data.prices = r.prices;
      renderPrices();
      render();
      box.textContent = 'Saved — the app shows these on its next launch. Store billing is unchanged.';
    }).catch(function (e) { box.textContent = 'Request failed: ' + e; });
  }
  /** Flatten a BodyReadingAnalysis into comparable "field -> value" pairs,
   * segmental sub-objects included, so the table can line the two up. */
  function flattenReading(r) {
    var out = {};
    if (!r) return out;
    ['deviceLabel','testDate','weightKg','bodyFatPercent','skeletalMuscleMassKg'].forEach(function (k) {
      if (r[k] != null) out[k] = r[k];
    });
    ['segmentalLeanMassKg','segmentalFatMassKg','segmentalLeanMassStatus','segmentalFatMassStatus'].forEach(function (g) {
      var v = r[g]; if (!v) return;
      Object.keys(v).forEach(function (k) { if (v[k] != null) out[g.replace('segmental','').replace('Kg','') + '.' + k] = v[k]; });
    });
    return out;
  }
  function testReport() {
    var msg = document.getElementById('rep_msg');
    var input = document.getElementById('rep_file');
    var file = input.files && input.files[0];
    msg.classList.remove('hide');
    if (!file) { msg.textContent = 'Pick a report file first.'; return; }
    msg.textContent = 'Reading ' + file.name + ' and sending to both providers…';
    document.getElementById('rep_wrap').classList.add('hide');
    document.getElementById('rep_raw').classList.add('hide');
    var reader = new FileReader();
    reader.onload = function () {
      var b64 = String(reader.result).split(',')[1] || '';
      var isPdf = file.type === 'application/pdf' || /\\.pdf$/i.test(file.name);
      var body = isPdf ? { pdf: b64 } : { image: b64, imageMediaType: file.type || 'image/jpeg' };
      api('/admin/api/test-report', body).then(function (r) {
        if (r.error) { msg.textContent = 'Error: ' + r.error; return; }
        renderReport(r);
      }).catch(function (e) { msg.textContent = 'Request failed: ' + e; });
    };
    reader.onerror = function () { msg.textContent = 'Could not read that file.'; };
    reader.readAsDataURL(file);
  }
  function renderReport(r) {
    var msg = document.getElementById('rep_msg');
    var c = r.claude || {}, d = r.deepseek || {};
    var cFlat = flattenReading(c.parsed), dFlat = flattenReading(d.parsed);
    var keys = Object.keys(cFlat).concat(Object.keys(dFlat)).filter(function (k, i, a) { return a.indexOf(k) === i; }).sort();
    var agree = 0, compared = 0, html = '';
    keys.forEach(function (k) {
      var cv = cFlat[k], dv = dFlat[k];
      var both = cv != null && dv != null;
      // Numbers within 2% count as agreement — two OCR reads of the same
      // printed figure shouldn't be called a mismatch over rounding.
      var same = both && (typeof cv === 'number' && typeof dv === 'number'
        ? Math.abs(cv - dv) <= Math.max(0.05, Math.abs(cv) * 0.02)
        : String(cv).trim().toLowerCase() === String(dv).trim().toLowerCase());
      if (both) { compared++; if (same) agree++; }
      var mark = !both ? '<span class="muted">—</span>' : same ? '<span style="color:var(--primary)">✓</span>' : '<span style="color:var(--danger)">✗</span>';
      html += '<tr><td>' + esc(k) + '</td><td>' + (cv == null ? '<span class="muted">—</span>' : esc(String(cv))) +
        '</td><td>' + (dv == null ? '<span class="muted">—</span>' : esc(String(dv))) + '</td><td>' + mark + '</td></tr>';
    });
    document.getElementById('rep_rows').innerHTML = html || '<tr><td colspan="4" class="muted">Neither provider returned any readable field.</td></tr>';
    document.getElementById('rep_wrap').classList.remove('hide');
    var parts = [];
    parts.push(c.ok ? 'Claude read ' + Object.keys(cFlat).length + ' fields in ' + c.ms + 'ms' : 'Claude failed: ' + esc(c.error || '?'));
    if (d.skipped) parts.push('DeepSeek skipped — ' + esc(d.error || ''));
    else parts.push(d.ok ? 'DeepSeek read ' + Object.keys(dFlat).length + ' fields in ' + d.ms + 'ms' : 'DeepSeek failed: ' + esc(d.error || '?'));
    if (compared) parts.push('<b>' + agree + ' of ' + compared + ' shared fields agree.</b>');
    msg.innerHTML = parts.join(' · ');
    if (d.raw) {
      var raw = document.getElementById('rep_raw');
      raw.classList.remove('hide');
      raw.innerHTML = '<b>DeepSeek raw reply:</b><br><code>' + esc(String(d.raw).slice(0, 1200)) + '</code>';
    }
  }
  function testDeepseekVision() {
    var box = document.getElementById('dstest');
    box.classList.remove('hide');
    box.textContent = 'Calling DeepSeek…';
    api('/admin/api/test-deepseek-vision', {}).then(function (r) {
      if (r.error) { box.textContent = 'Error: ' + r.error; return; }
      if (!r.ok) { box.textContent = 'Failed after ' + r.ms + 'ms: ' + r.error; return; }
      box.textContent = 'OK in ' + r.ms + 'ms · model ' + r.model + ' · ' + r.inputTokens + ' in / ' + r.outputTokens + ' out tokens · reply: ' + r.text;
    }).catch(function (e) { box.textContent = 'Request failed: ' + e; });
  }
  /** One line per food item: name, calories, and P/C/F macros in grams. */
  function testDeepseekText() {
    var box = document.getElementById('dstest2');
    box.classList.remove('hide');
    box.textContent = 'Calling DeepSeek…';
    api('/admin/api/test-deepseek-text', {}).then(function (r) {
      if (r.error) { box.textContent = 'Error: ' + r.error; return; }
      if (!r.ok) { box.textContent = 'Failed after ' + r.ms + 'ms: ' + r.error; return; }
      box.textContent = 'OK in ' + r.ms + 'ms · model ' + r.model + ' · ' + r.inputTokens + ' in / ' + r.outputTokens + ' out tokens · reply: ' + r.text;
    }).catch(function (e) { box.textContent = 'Request failed: ' + e; });
  }
  function mealDetail(m) {
    if (!m || !Array.isArray(m.items) || !m.items.length) return '<span class="muted">—</span>';
    return m.items.map(function (it) {
      return esc(it.name) + ' — ' + Math.round(it.calories || 0) + ' kcal' +
        ' (P' + Math.round(it.proteinG || 0) + ' C' + Math.round(it.carbsG || 0) + ' F' + Math.round(it.fatG || 0) + ')';
    }).join('<br>');
  }
  function renderShadow() {
    var rows = data.shadowTests || [];
    var html = '';
    rows.forEach(function (t) {
      var deepseekCell = t.deepseekError
        ? '<span style="color:var(--danger)">' + esc(t.deepseekError) + '</span>'
        : mealDetail(t.deepseekResult) + (t.deepseekMs != null ? '<div class="muted">' + t.deepseekMs + 'ms</div>' : '');
      html += '<tr>' +
        '<td class="muted">' + new Date(t.createdAt).toLocaleString() + '</td>' +
        '<td style="font-family:monospace">' + esc(t.ref) + '</td>' +
        '<td>' + mealDetail(t.claudeResult) + '<div class="muted">' + esc(t.claudeModel) + (t.claudeMs != null ? ' · ' + t.claudeMs + 'ms' : '') + '</div></td>' +
        '<td>' + deepseekCell + '</td>' +
        '<td class="muted">' + (t.deepseekCostUsd == null ? '—' : (t.deepseekCostUsd * USD_TO_SAR).toFixed(4)) + '</td>' +
        '</tr>';
    });
    document.getElementById('shadowrows').innerHTML = html || '<tr><td colspan="5" class="muted">No shadow tests logged yet.</td></tr>';
    document.getElementById('shadowcard').style.display = data.deepseekConfigured || rows.length ? '' : 'none';
  }
  function fmtTokens(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) {
    return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]; }); }
  function pick(ref) { document.getElementById('g_ref').value = ref; window.scrollTo({ top:0, behavior:'smooth' }); }
  function setPlan(plan) {
    var days = parseInt(document.getElementById('g_days').value, 10);
    api('/admin/api/plan', {
      ref: document.getElementById('g_ref').value,
      plan: plan,
      days: isNaN(days) ? undefined : days,
      note: document.getElementById('g_note').value || undefined,
    }).then(load);
  }
  function saveLimits() {
    api('/admin/api/limits', {
      free: parseInt(document.getElementById('lim_free').value, 10),
      pro: parseInt(document.getElementById('lim_pro').value, 10),
      proPlus: parseInt(document.getElementById('lim_proplus').value, 10),
    }).then(load);
  }
  function saveSponsor() {
    api('/admin/api/sponsor', {
      enabled: document.getElementById('sp_on').checked,
      title: document.getElementById('sp_title').value,
      subtitle: document.getElementById('sp_sub').value,
      imageUrl: document.getElementById('sp_img').value,
      linkUrl: document.getElementById('sp_link').value,
    }).then(load);
  }
  if (sessionStorage.getItem('ct')) load();
</script>
</body>
</html>`;
