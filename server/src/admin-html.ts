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
  input { width:100%; padding:9px 11px; border:1px solid var(--line); border-radius:9px;
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
      <b>Users</b>
      <div class="scroll">
        <table>
          <thead><tr><th>Ref</th><th>Email</th><th>Plan</th><th>Source</th><th>Used</th><th>Note</th><th>Last seen</th><th></th></tr></thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<script>
  // Pricing assumptions used only for the on-screen estimates.
  var PRICE_SAR = 13, STORE_CUT = 0.15, COST_PER_ACTION_SAR = 0.014;
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
      Math.round(s.proUsers * PRICE_SAR * (1 - STORE_CUT));
    document.getElementById('s_cost').textContent =
      Math.round(s.actionsThisMonth * COST_PER_ACTION_SAR);
    document.getElementById('lim_free').value = data.limits.free;
    document.getElementById('lim_pro').value = data.limits.pro;
    document.getElementById('lim_proplus').value = data.limits.proPlus;
    var sp = data.sponsor || {};
    document.getElementById('sp_title').value = sp.title || '';
    document.getElementById('sp_sub').value = sp.subtitle || '';
    document.getElementById('sp_img').value = sp.imageUrl || '';
    document.getElementById('sp_link').value = sp.linkUrl || '';
    document.getElementById('sp_on').checked = !!sp.enabled;

    var html = '';
    data.users.forEach(function (u) {
      var isPro = u.plan === 'pro' || u.plan === 'proPlus';
      html += '<tr>' +
        '<td style="font-family:monospace">' + esc(u.ref) + '</td>' +
        '<td>' + (u.email ? esc(u.email) : '<span class="muted">guest</span>') + '</td>' +
        '<td><span class="pill ' + (isPro ? 'pro' : 'free') + '">' + u.plan + '</span></td>' +
        '<td class="muted">' + esc(u.planSource) + '</td>' +
        '<td>' + u.used + '</td>' +
        '<td class="muted">' + esc(u.note || '') + '</td>' +
        '<td class="muted">' + new Date(u.lastSeenAt).toLocaleDateString() + '</td>' +
        '<td><button class="ghost" onclick="pick(\\'' + esc(u.ref) + '\\')">Select</button></td>' +
        '</tr>';
    });
    document.getElementById('rows').innerHTML = html || '<tr><td colspan="8" class="muted">No users yet.</td></tr>';
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
