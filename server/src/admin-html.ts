/**
 * Calgym admin dashboard — a single self-contained page served at /admin.
 * The admin token is entered in the browser and kept in sessionStorage; it is
 * never baked into this file.
 *
 * Light only, in tabs: Overview (range, headline cards, a chart with its data
 * table, what needs attention, the launch checklist, recent activity), Users,
 * Membership, Codes & partners, AI and Content. The tab lives in the URL hash
 * so a reload or a shared link opens the same place.
 */
export const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="robots" content="noindex, nofollow" />
<title>Calgym Admin</title>
<style>
  :root { color-scheme: light;
    --bg:#EEF0F4; --card:#FFFFFF; --text:#282B34; --muted:#646D7A; --line:#E5E8ED;
    --primary:#5B4899; --primary-soft:#EFEBFA; --lime:#E2F795; --lime-ink:#3F4A12; --peach:#FFE7DA; --peach-ink:#6B3A22;
    --orange:#E0673A; --olive:#5E7A0B; --green:#2E7D57; --green-soft:#E3F4EA; --danger:#C0392B; --danger-soft:#FBE9E7;
    --warn:#8A5A00; --warn-soft:#FFF4D6; --radius:18px; --gap:16px; }
  * { box-sizing:border-box; }
  html, body { background:var(--bg); }
  body { margin:0; color:var(--text); font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  .wrap { max-width:1180px; margin:0 auto; padding:20px 16px 48px; }
  h1 { font-size:22px; margin:0; letter-spacing:-.2px; }
  h2 { font-size:17px; margin:0 0 6px; }
  h3 { font-size:14px; margin:0 0 8px; color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:.4px; }
  .topbar { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:14px; }
  .topbar .spacer { flex:1; }
  .logo { width:34px; height:34px; border-radius:10px; background:linear-gradient(135deg,#9B86D4,#7FB89B); display:grid; place-items:center; color:#fff; font-weight:800; }
  .tabs { display:flex; gap:6px; overflow-x:auto; padding:4px; background:var(--card); border:1px solid var(--line); border-radius:14px; margin-bottom:var(--gap); position:sticky; top:8px; z-index:5; box-shadow:0 2px 10px rgba(40,43,52,.05); }
  .tab { flex:0 0 auto; background:transparent; color:var(--muted); border:0; border-radius:10px; padding:10px 14px; font-weight:700; font-size:14px; cursor:pointer; min-height:42px; display:flex; align-items:center; gap:8px; }
  .tab:hover { color:var(--text); background:var(--bg); }
  .tab[aria-selected="true"] { background:var(--primary); color:#fff; }
  .tab:focus-visible, button:focus-visible, .chip:focus-visible, summary:focus-visible { outline:3px solid #9B86D4; outline-offset:2px; }
  .badge { background:var(--danger); color:#fff; border-radius:99px; font-size:11px; padding:1px 7px; line-height:18px; }
  .tab[aria-selected="true"] .badge { background:#fff; color:var(--danger); }
  .panel[hidden] { display:none; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:var(--radius); padding:18px; margin-bottom:var(--gap); }
  .grid { display:grid; gap:var(--gap); }
  .cols-3 { grid-template-columns:repeat(3,minmax(0,1fr)); }
  .cols-main { grid-template-columns:minmax(0,2fr) minmax(0,1fr); align-items:start; }
  .cols-2 { grid-template-columns:repeat(2,minmax(0,1fr)); align-items:start; }
  @media (max-width: 860px) { .cols-3, .cols-main, .cols-2 { grid-template-columns:1fr; } }
  .metric { border-radius:var(--radius); padding:18px 20px; border:1px solid var(--line); background:var(--card); }
  .metric.lime { background:var(--lime); border-color:transparent; color:var(--lime-ink); }
  .metric.peach { background:var(--peach); border-color:transparent; color:var(--peach-ink); }
  .metric .label { font-size:14px; font-weight:600; }
  .metric .value { font-size:34px; font-weight:800; letter-spacing:-.5px; margin:6px 0 2px; font-variant-numeric:tabular-nums; color:var(--text); }
  .metric .note { font-size:13px; opacity:.85; }
  .strip { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin:var(--gap) 0; }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:12px 14px; }
  .stat b { display:block; font-size:22px; font-variant-numeric:tabular-nums; }
  .stat span { color:var(--muted); font-size:13px; }
  .chips { display:flex; gap:8px; flex-wrap:wrap; }
  .chip { border:1px solid var(--line); background:var(--card); color:var(--text); border-radius:99px; padding:8px 14px; font-weight:600; font-size:14px; cursor:pointer; min-height:40px; }
  .chip[aria-pressed="true"] { background:var(--primary-soft); border-color:var(--primary); color:var(--primary); }
  .chart-head { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:8px; }
  .legend { display:flex; gap:14px; flex-wrap:wrap; font-size:13px; color:var(--muted); margin:4px 0 0; }
  .legend i { display:inline-block; width:18px; height:3px; border-radius:2px; vertical-align:middle; margin-inline-end:6px; }
  .chart svg { width:100%; height:auto; display:block; }
  .linkbtn { background:none; border:0; color:var(--primary); font-weight:700; padding:10px 0; cursor:pointer; font-size:14px; min-height:40px; }
  .list { list-style:none; margin:0; padding:0; }
  .list li { display:flex; gap:10px; align-items:flex-start; padding:10px 0; border-bottom:1px solid var(--line); }
  .list li:last-child { border-bottom:0; }
  .dot { width:22px; height:22px; border-radius:50%; flex:0 0 22px; display:grid; place-items:center; font-size:13px; font-weight:800; }
  .dot.ok { background:var(--green-soft); color:var(--green); }
  .dot.todo { background:var(--warn-soft); color:var(--warn); }
  .dot.bad { background:var(--danger-soft); color:var(--danger); }
  .list .grow { flex:1; min-width:0; }
  .list .hint { color:var(--muted); font-size:13px; }
  label { display:block; font-size:13px; color:var(--muted); margin:8px 0 4px; font-weight:600; }
  input, select { width:100%; padding:10px 12px; border:1px solid #D5D9E0; border-radius:10px; background:#fff; color:var(--text); font-size:14px; min-height:42px; }
  input[type=checkbox] { min-height:0; }
  input:focus, select:focus { outline:2px solid #9B86D4; border-color:transparent; }
  button { background:var(--primary); color:#fff; border:0; border-radius:10px; padding:10px 16px; font-weight:700; cursor:pointer; font-size:14px; min-height:42px; }
  button.ghost { background:#fff; color:var(--primary); border:1px solid #CFC6EC; }
  button.ghost:hover { background:var(--primary-soft); }
  .row { display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; }
  .row > div { flex:1; min-width:140px; }
  .scroll { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; font-size:14px; min-width:640px; }
  table.compact { min-width:0; }
  th, td { text-align:start; padding:10px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { color:var(--muted); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.3px; background:#FAFBFC; }
  td.num, th.num { text-align:end; font-variant-numeric:tabular-nums; }
  td.when { white-space:nowrap; color:var(--muted); }
  .pill { display:inline-block; padding:2px 10px; border-radius:99px; font-size:12px; font-weight:700; }
  .pro { background:var(--green-soft); color:var(--green); }
  .free { background:#EDEFF3; color:var(--muted); }
  .muted { color:var(--muted); }
  .sub { color:var(--muted); font-size:14px; }
  .err { color:var(--danger); font-size:14px; margin-top:8px; }
  .hide { display:none; }
  details.how { margin:2px 0 12px; }
  details.how summary { cursor:pointer; color:var(--primary); font-weight:600; font-size:14px; list-style:none; display:inline-flex; align-items:center; gap:6px; min-height:32px; }
  details.how summary::before { content:"ⓘ"; }
  details.how > div { color:var(--muted); font-size:14px; background:#FAFBFC; border:1px solid var(--line); border-radius:12px; padding:12px 14px; margin-top:6px; }
  .empty { color:var(--muted); font-size:14px; padding:14px 0; }
  .auth { max-width:420px; margin:12vh auto 0; }
  code { background:#F3F4F7; padding:1px 5px; border-radius:6px; font-size:13px; }
  @media (prefers-reduced-motion: no-preference) { .panel { animation:fade .18s ease-out; } @keyframes fade { from { opacity:0 } to { opacity:1 } } }
</style>
</head>
<body>
<div class="wrap">
  <div class="card auth" id="auth">
    <div class="topbar"><div class="logo" aria-hidden="true">C</div><h1>Calgym Admin</h1></div>
    <label for="token">Admin token</label>
    <div class="row">
      <div><input id="token" type="password" placeholder="ADMIN_TOKEN" autocomplete="current-password" onkeydown="if (event.key === 'Enter') load()" /></div>
      <button onclick="load()">Sign in</button>
    </div>
    <div class="err hide" id="autherr" role="alert">Wrong token, or ADMIN_TOKEN is not set on the server.</div>
  </div>

  <div id="app" class="hide">
    <div class="topbar">
      <div class="logo" aria-hidden="true">C</div>
      <div><h1>Calgym Admin</h1><div class="sub" id="updated">Loading…</div></div>
      <div class="spacer"></div>
      <button class="ghost" onclick="refreshAll()">Refresh</button>
      <button class="ghost" onclick="signOut()">Sign out</button>
    </div>

    <nav class="tabs" role="tablist" aria-label="Sections">
      <button class="tab" role="tab" id="t-overview" aria-controls="p-overview" data-tab="overview">Overview</button>
      <button class="tab" role="tab" id="t-users" aria-controls="p-users" data-tab="users">Users <span class="badge hide" id="b-users"></span></button>
      <button class="tab" role="tab" id="t-membership" aria-controls="p-membership" data-tab="membership">Membership</button>
      <button class="tab" role="tab" id="t-codes" aria-controls="p-codes" data-tab="codes">Codes &amp; partners</button>
      <button class="tab" role="tab" id="t-ai" aria-controls="p-ai" data-tab="ai">AI <span class="badge hide" id="b-ai"></span></button>
      <button class="tab" role="tab" id="t-content" aria-controls="p-content" data-tab="content">Content <span class="badge hide" id="b-content"></span></button>
    </nav>

    <section class="panel" role="tabpanel" id="p-overview" aria-labelledby="t-overview">
      <h3>This month</h3>
      <div class="grid cols-3">
        <div class="metric lime"><div class="label">Paying members</div><div class="value" id="s_pro">—</div><div class="note">≈ <span id="s_mrr">—</span> <span id="s_cur">SAR</span> a month after store fees (est.)</div></div>
        <div class="metric peach"><div class="label">Active this month</div><div class="value" id="s_active">—</div><div class="note">of <span id="s_users">—</span> users in total</div></div>
        <div class="metric"><div class="label muted">AI cost this month</div><div class="value" id="s_cost">—</div><div class="note muted">SAR (est.) · <span id="s_actions">—</span> AI actions</div></div>
      </div>
      <div class="chart-head" style="margin:22px 0 0">
        <h3 style="margin:0">Activity</h3>
        <div class="chips" role="group" aria-label="Date range">
          <button class="chip" data-days="7" onclick="setRange(7)">Last 7 days</button>
          <button class="chip" data-days="30" onclick="setRange(30)">Last 30 days</button>
          <button class="chip" data-days="90" onclick="setRange(90)">Last 90 days</button>
        </div>
      </div>
      <div class="strip" id="ov_strip" aria-live="polite"></div>
      <div class="grid cols-main">
        <div class="card chart" style="margin:0">
          <div class="chart-head">
            <h2 id="ov_title" style="margin:0">Growth</h2>
            <div class="chips" role="group" aria-label="Chart">
              <button class="chip" data-view="growth" onclick="setView('growth')">Growth</button>
              <button class="chip" data-view="store" onclick="setView('store')">Store</button>
              <button class="chip" data-view="ai" onclick="setView('ai')">AI</button>
            </div>
          </div>
          <div class="legend" id="ov_legend"></div>
          <div id="ov_chart" aria-live="polite"><div class="empty">Loading…</div></div>
          <div class="sub" id="ov_note"></div>
          <button class="linkbtn" id="ov_toggle" aria-expanded="false" aria-controls="ov_table" onclick="toggleChartData()">View chart data</button>
          <div class="scroll hide" id="ov_table"></div>
        </div>
        <div>
          <div class="card" style="margin-bottom:var(--gap)">
            <h2>Needs attention</h2>
            <ul class="list" id="ov_attention"><li class="empty">Loading…</li></ul>
          </div>
          <div class="card" style="margin:0">
            <h2>Launch checklist</h2>
            <div class="sub" id="ov_check_sum" style="margin-bottom:4px"></div>
            <ul class="list" id="ov_checklist"><li class="empty">Loading…</li></ul>
          </div>
        </div>
      </div>
      <div class="grid cols-3" style="margin-top:var(--gap)">
        <div class="card" style="margin:0"><h2>Recent store events</h2><div id="ov_billing" class="scroll"></div></div>
        <div class="card" style="margin:0"><h2>Recent code redemptions</h2><div id="ov_redeem" class="scroll"></div></div>
        <div class="card" style="margin:0"><h2>Newest users</h2><div id="ov_signups" class="scroll"></div></div>
      </div>
    </section>

    <section class="panel" role="tabpanel" id="p-users" aria-labelledby="t-users" hidden>
    <div class="card" id="delreq">
      <h2>Account deletion requests</h2>
      <details class="how"><summary>How this works</summary><div>People who ask to delete their account from the public page (<code>/account-deletion</code>) — Google Play requires one. In the app, deletion is immediate and never shows up here. Delete the matching account(s) and close the request within 30 days, then confirm to the person by email.</div></details>
      <div id="dr_rows"><div class="empty">Loading…</div></div>
    </div>
    <div class="card">
      <h2>Users</h2>
      <div class="row" style="margin:6px 0 10px"><div><label for="u_search">Find a user</label><input id="u_search" type="search" placeholder="Email, ref, device or note" oninput="renderUsers()" /></div><div class="sub" id="u_count" style="flex:0 0 auto;padding-bottom:10px"></div></div>
      <div class="err hide" id="rowerr"></div>
      <details class="how"><summary>How this works</summary><div>"Tokens"/"Cost" are real, tracked from 9/2/2026 onward. "Historical" is a rough per-kind-weighted guess for all-time usage before that (coach and web-search-backed calls cost more than a plain photo scan) — for a sense of scale only, not real data, and won't reconcile exactly against your Anthropic Console bill.</div></details>
      <div class="scroll">
        <table>
          <thead><tr><th>Ref</th><th>Email</th><th>Device</th><th>Plan</th><th>Source</th><th>Used</th><th>Tokens</th><th>Cost (SAR)</th><th>Historical (est. SAR)</th><th>Note</th><th>Last seen</th><th></th></tr></thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2>Grant or revoke Pro</h2>
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
    </section>

    <section class="panel" role="tabpanel" id="p-membership" aria-labelledby="t-membership" hidden>
    <div class="card">
      <h2>Membership prices</h2>
      <details class="how"><summary>How this works</summary><div>Used for the revenue estimate above, and shown on the upgrade screen only until the store products are live. <b>Once subscriptions are on, the app shows the store's own price</b> — set in App Store Connect / Google Play, in each person's currency with VAT included — so there is one price to manage, and it is there. These numbers never change what anyone is charged.</div></details>
      <div class="row">
        <div><label>Pro / month</label><input id="pr_pro" type="number" step="0.01" /></div>
        <div><label>Pro+ / month</label><input id="pr_proplus" type="number" step="0.01" /></div>
        <div><label>Pro / year</label><input id="pr_proyear" type="number" step="0.01" /></div>
        <div><label>Currency</label><input id="pr_cur" maxlength="8" /></div>
        <button onclick="savePrices()">Save prices</button>
      </div>
      <div id="pr_msg" class="sub hide" style="margin-top:8px"></div>
    </div>

    <div class="card">
      <h2>Plan locks</h2>
      <div class="sub" style="margin:0 0 10px">When on, each plan gets only its own features. Turn this on once the store can sell, after testers have the FOUNDERS code. Anything people already made stays usable either way.</div>
      <table>
        <thead><tr><th>Feature</th><th>Free</th><th>Pro</th><th>Pro+</th></tr></thead>
        <tbody>
          <tr><td>Logging, workouts, rest timer, body map, backup</td><td>Yes</td><td>Yes</td><td>Yes</td></tr>
          <tr><td>Saved schedules</td><td>1</td><td>Unlimited</td><td>Unlimited</td></tr>
          <tr><td>Health trend history</td><td>30 days</td><td>All</td><td>All</td></tr>
          <tr><td>AI coach messages</td><td>3</td><td>Allowance</td><td>Allowance</td></tr>
          <tr><td>Writing recipes, meal plans, shopping list</td><td>No</td><td>Yes</td><td>Yes</td></tr>
          <tr><td>InBody reading with AI, new WHOOP connection</td><td>No</td><td>Yes</td><td>Yes</td></tr>
          <tr><td>AI program builder</td><td>No</td><td>1 a month</td><td>Unlimited</td></tr>
          <tr><td>Coach memory (photos and files)</td><td>No</td><td>No</td><td>Yes</td></tr>
          <tr><td>More accurate meal analysis</td><td>No</td><td>No</td><td>Yes</td></tr>
        </tbody>
      </table>
      <div class="row" style="margin-top:12px">
        <label style="margin:0"><input id="locks_on" type="checkbox" style="width:auto" /> Plan locks on</label>
        <button onclick="saveLocks()">Save</button>
      </div>
      <div id="locks_msg" class="sub" style="margin-top:8px"></div>
    </div>

    <div class="card">
      <h2>Monthly AI allowance</h2>
      <div class="row">
        <div><label>Free</label><input id="lim_free" type="number" min="0" /></div>
        <div><label>Pro</label><input id="lim_pro" type="number" min="0" /></div>
        <div><label>Pro+</label><input id="lim_proplus" type="number" min="0" /></div>
        <div><label>Free trial (whole trial)</label><input id="lim_trial" type="number" min="0" /></div>
        <button onclick="saveLimits()">Save</button>
      </div>
      <div class="sub" style="margin:10px 0 0">Every AI action counts, but not all cost the same — see the action costs below. A store free trial gets the paid features with the trial allowance until its first paid renewal.</div>
    </div>

    <div class="card">
      <h2>Action costs</h2>
      <div class="row">
        <div><label>Meal photo</label><input id="w_meal" type="number" min="1" max="50" /></div>
        <div><label>Describe</label><input id="w_describe" type="number" min="1" max="50" /></div>
        <div><label>Equipment</label><input id="w_equipment" type="number" min="1" max="50" /></div>
        <div><label>Exercise</label><input id="w_exercise" type="number" min="1" max="50" /></div>
        <div><label>Body reading</label><input id="w_bodyReading" type="number" min="1" max="50" /></div>
        <div><label>Coach msg</label><input id="w_coach" type="number" min="1" max="50" /></div>
        <div><label>Programme</label><input id="w_program" type="number" min="1" max="50" /></div>
        <button onclick="saveWeights()">Save</button>
      </div>
      <div class="sub" style="margin:10px 0 0">How many credits each route spends from the allowance above. Designing a programme is a long tool-calling conversation costing many times a single meal photo — charging both as one action is what lets a free user spend the whole month on the most expensive route. Set these from the per-kind spend in the usage table, not by feel.</div>
    </div>
    </section>

    <section class="panel" role="tabpanel" id="p-codes" aria-labelledby="t-codes" hidden>
    <div class="card" id="partners">
      <h2>Partners</h2>
      <details class="how"><summary>How this works</summary><div>People and businesses who share your codes. Give a partner one or more codes below (each code sets its own discount for the buyer and share for the partner), and link a partner's code to the code of whoever brought them in — up to two levels up. Earnings are counted on what each payment brings in after the store's fee and tax, in US dollars. The last 30 days stay <i>pending</i> (the store refund window); <i>Owed</i> is what has cleared, less what you have recorded as paid. Payouts happen outside the app — record them here. Each partner has a private read-only link to their own figures.</div></details>
      <div class="row">
        <div><label>Name</label><input id="pt_name" placeholder="e.g. Sara (FitLife gym)" /></div>
        <div><label>Contact</label><input id="pt_contact" placeholder="phone or email" /></div>
        <div><label>Note</label><input id="pt_note" placeholder="bank details, agreement…" /></div>
      </div>
      <div class="row" style="margin-top:10px">
        <label style="margin:0"><input id="pt_active" type="checkbox" checked style="width:auto" /> Active</label>
        <button onclick="savePartner()">Save partner</button>
        <button class="ghost" onclick="clearPartnerForm()">Clear form</button>
      </div>
      <div id="pt_msg" class="sub hide" style="margin-top:8px"></div>
      <div class="scroll" style="margin-top:12px">
        <table>
          <thead><tr><th>Partner</th><th>Codes</th><th>Payments</th><th>Earned</th><th>Pending</th><th>Paid</th><th>Owed</th><th></th></tr></thead>
          <tbody id="pt_rows"></tbody>
        </table>
      </div>
    </div>

    <div class="card" id="codes">
      <h2>Promotion codes</h2>
      <details class="how"><summary>How this works</summary><div><b>Free access</b> gives a tier for a number of days at no charge — handled entirely here, no store setup. <b>Percent off</b> is a real discount on a paid subscription, so the store has to know about it: create an offer code in App Store Connect (Subscriptions → your subscription → Offer Codes → custom code) and/or a developer-determined offer on the Google Play base plan, then put those ids below. The store then charges the discounted price, in the person's currency, with VAT. <i>Used</i> counts redemptions in the app; <i>Paid</i> counts purchases matched back to them. To step a discount down (e.g. 50% for the first 100, then 30%), give the first code a use limit or end date and create the next one.</div></details>
      <div class="row">
        <div><label>Code</label><input id="pc_code" placeholder="RAMADAN50" autocomplete="off" /></div>
        <div><label>Type</label><select id="pc_kind" onchange="pcKind()"><option value="free">Free access</option><option value="percent">Percent off</option></select></div>
        <div><label>Tier</label><select id="pc_plan"><option value="pro">Pro</option><option value="proPlus">Pro+</option></select></div>
        <div class="pc-free"><label>Days of access</label><input id="pc_days" type="number" min="1" max="3650" value="30" /></div>
        <div class="pc-pct hide"><label>% off</label><input id="pc_pct" type="number" min="1" max="100" /></div>
      </div>
      <div class="row pc-pct hide">
        <div><label>App Store offer code</label><input id="pc_ios" placeholder="the custom code made in App Store Connect" /></div>
        <div><label>Google Play offer id</label><input id="pc_android" placeholder="offerId, or basePlanId:offerId" /></div>
      </div>
      <div class="row">
        <div><label>Max uses (blank = unlimited)</label><input id="pc_max" type="number" min="1" /></div>
        <div><label>Starts (optional)</label><input id="pc_start" type="datetime-local" /></div>
        <div><label>Ends (optional)</label><input id="pc_end" type="datetime-local" /></div>
        <div><label>Note</label><input id="pc_note" placeholder="e.g. gym partnership" /></div>
      </div>
      <div class="sub" style="margin:14px 0 0"><b>Earnings</b> — who is paid from this code's sales. Leave the owner empty for a code that pays nobody.</div>
      <div class="row">
        <div><label>Owner (partner)</label><select id="pc_partner"><option value="">— nobody —</option></select></div>
        <div><label>Owner's share %</label><input id="pc_comm" type="number" min="0" max="100" step="0.5" placeholder="e.g. 20" /></div>
        <div><label>Paid on</label><select id="pc_term" onchange="pcTerm()"><option value="lifetime">every payment</option><option value="first">first payment only</option><option value="months">payments for N months</option></select></div>
        <div class="pc-months hide"><label>Months</label><input id="pc_months" type="number" min="1" max="120" value="12" /></div>
      </div>
      <div class="row">
        <div><label>Linked to (who brought the owner)</label><select id="pc_parent" onchange="pcParent()"><option value="">— not linked —</option></select></div>
        <div class="pc-link hide"><label>Their share %</label><input id="pc_ppct" type="number" min="0" max="100" step="0.5" placeholder="e.g. 5" /></div>
        <div class="pc-grand hide"><label id="pc_glabel">Share % two levels up</label><input id="pc_gpct" type="number" min="0" max="100" step="0.5" placeholder="e.g. 2" /></div>
      </div>
      <div class="row" style="margin-top:10px">
        <label style="margin:0"><input id="pc_active" type="checkbox" checked style="width:auto" /> Active</label>
        <button onclick="savePromo()">Save code</button>
        <button class="ghost" onclick="clearPromoForm()">Clear form</button>
      </div>
      <div id="pc_msg" class="sub hide" style="margin-top:8px"></div>
      <div class="scroll" style="margin-top:12px">
        <table>
          <thead><tr><th>Code</th><th>Gives</th><th>Earns</th><th>Used</th><th>Left</th><th>Paid</th><th>Window</th><th>Status</th><th></th></tr></thead>
          <tbody id="pc_rows"></tbody>
        </table>
      </div>
      <div id="pc_detail" class="hide" style="margin-top:12px"></div>
    </div>
    </section>

    <section class="panel" role="tabpanel" id="p-ai" aria-labelledby="t-ai" hidden>
    <div class="card">
      <h2>AI provider by membership</h2>
      <details class="how"><summary>How this works</summary><div>Which model answers for each tier, across every AI route: meal photo scans, described meals, "refine" edits, exercise info, equipment scans, body readings, coach chat, coach attachments and program design. Takes effect on the next request — no redeploy. Claude stays fully configured either way; it simply isn't called for a tier set to DeepSeek, so it stops costing you anything there.</div></details>
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
      <div class="sub" style="margin-top:10px"><b>One exception the setting cannot cover:</b></div>
      <div class="sub" id="prov_fixed"></div>
    </div>

    <div class="card">
      <h2>AI failures</h2>
      <details class="how"><summary>How this works</summary><div>Why AI calls have been failing, in the provider's own words. Every route used to answer the app with one generic code, so an outage looked the same as a bad request and could only be guessed at. If one code dominates the last 24 hours, that is the outage.</div></details>
      <div id="aif_empty" class="muted">No AI failures recorded.</div>
      <div id="aif_summary"></div>
      <div id="aif_recent"></div>
    </div>

    <div class="card">
      <h2>DeepSeek connection test</h2>
      <details class="how"><summary>How this works</summary><div>Fires one real DeepSeek text call (an exercise-info lookup) so you can confirm the key works and the model is answering, without spending a user's scan on it. Worth running right after changing any tier to DeepSeek above.</div></details>
      <div class="row" style="margin-bottom:10px">
        <button class="ghost" onclick="testDeepseekText()">Test DeepSeek text now</button>
      </div>
      <div id="dstest2" class="sub hide"></div>
    </div>

    <div class="card" id="shadowcard">
      <h2>DeepSeek shadow test — meal scans</h2>
      <details class="how"><summary>How this works</summary><div>Runs only for scans from a tier still set to Claude above: that scan is answered by Claude, and the same photo also goes to DeepSeek in the background and is logged here side by side. A tier already on DeepSeek has nothing to compare, so it makes no shadow call. Empty if <code>DEEPSEEK_API_KEY</code> isn't set on the server.</div></details>
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
      <h2>Report test — DeepSeek vs Claude on a real report</h2>
      <details class="how"><summary>How this works</summary><div>Spot-check either provider on a real report. Pick an InBody/Tanita/DEXA report and both read it with the identical prompt the live route uses, shown field by field below, so you can confirm accuracy before trusting a new report format or re-checking after a model update. A photo or screenshot compares both; a PDF runs Claude only, since our DeepSeek client sends images. <b>This spends on both providers</b> — that is the point — and uses nobody's monthly allowance.</div></details>
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
    </section>

    <section class="panel" role="tabpanel" id="p-content" aria-labelledby="t-content" hidden>
    <div class="card">
      <h2>Product review queue</h2>
      <details class="how"><summary>How this works</summary><div>Products read from a label photo are served back to whoever added them, and to nobody else until checked here. Compare the readings — two people reading the same label differently is the signal something is wrong — then publish the right one to everyone, or reject it.</div></details>
      <div id="queue_empty" class="muted">Nothing waiting.</div>
      <div id="queue"></div>
    </div>

    <div class="card">
      <h2>Sponsor slot</h2>
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
    </section>
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
      Math.round(s.proUsers * monthlyPrice() * (1 - STORE_CUT)).toLocaleString();
    document.getElementById('s_cur').textContent = (data.prices && data.prices.currency) || 'SAR';
    document.getElementById('updated').textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById('s_cost').textContent =
      (s.costUsdThisMonth * USD_TO_SAR).toFixed(2);
    document.getElementById('lim_free').value = data.limits.free;
    document.getElementById('lim_pro').value = data.limits.pro;
    document.getElementById('lim_proplus').value = data.limits.proPlus;
    document.getElementById('lim_trial').value = data.trialLimit != null ? data.trialLimit : '';
    document.getElementById('locks_on').checked = !!data.planLocks;
    document.getElementById('locks_msg').textContent = data.planLocks
      ? 'On: plans are locked to their own features.'
      : 'Off: every plan can use every feature; only the AI allowance differs.';
    loadQueue();
    loadAiFailures();
    loadPartners();
    var W = data.weights || {};
    WEIGHT_KINDS.forEach(function (k) {
      var el = document.getElementById('w_' + k);
      if (el) el.value = W[k] || 1;
    });
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

    renderUsers();
    loadOverview();
    loadDeletionRequests();
  }
  function loadDeletionRequests() {
    fetch('/admin/api/deletion-requests', { headers: { 'x-admin-token': tok() } })
      .then(function (r) { return r.json(); })
      .then(function (d) { renderDeletionRequests(d.requests || []); })
      .catch(function () {});
  }
  function renderDeletionRequests(rows) {
    var host = document.getElementById('dr_rows');
    if (!rows.length) { host.innerHTML = '<div class="empty">No requests.</div>'; return; }
    host.innerHTML = '';
    var scroll = document.createElement('div');
    scroll.className = 'scroll';
    var table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Email</th><th>Note</th><th>Asked</th><th>Accounts found</th><th></th></tr></thead>';
    var body = document.createElement('tbody');
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      // Text nodes only: every field here was typed by a member of the public.
      [r.email, r.note || '—', new Date(r.createdAt).toLocaleDateString(), r.refs.length ? r.refs.join(', ') : 'none with this email'].forEach(function (v, i) {
        var td = document.createElement('td');
        td.textContent = String(v);
        if (i > 0) td.className = 'muted';
        tr.appendChild(td);
      });
      var act = document.createElement('td');
      if (r.doneAt) {
        act.innerHTML = '<span class="pill pro">done ' + esc(new Date(r.doneAt).toLocaleDateString()) + '</span>';
      } else {
        var del = document.createElement('button');
        del.textContent = r.refs.length ? 'Delete ' + r.refs.length + ' account' + (r.refs.length === 1 ? '' : 's') + ' & close' : 'Close';
        del.addEventListener('click', function () {
          if (r.refs.length && !confirm('Permanently delete the account(s) and sign-in for ' + r.email + '? This cannot be undone.')) return;
          api('/admin/api/deletion-request-done', { id: r.id, deleteRefs: r.refs }).then(function (res) {
            if (res.account === 'not_configured') alert('Records deleted. The sign-in account was not: set SUPABASE_SERVICE_ROLE_KEY on the server, or delete ' + r.email + ' in Supabase → Authentication.');
            loadDeletionRequests(); loadOverview();
          }).catch(function () { alert('Could not delete the sign-in account; the request is still open — try again.'); });
        });
        act.appendChild(del);
      }
      tr.appendChild(act);
      body.appendChild(tr);
    });
    table.appendChild(body);
    scroll.appendChild(table);
    host.appendChild(scroll);
  }
  function renderUsers() {
    var q = (document.getElementById('u_search').value || '').trim().toLowerCase();
    var list = data.users.filter(function (u) {
      return !q || [u.ref, u.email, u.device, u.note, u.plan].some(function (v) { return v && String(v).toLowerCase().indexOf(q) >= 0; });
    });
    document.getElementById('u_count').textContent = q ? list.length + ' of ' + data.users.length : data.users.length + ' users';
    var html = '';
    list.forEach(function (u) {      var isPro = u.plan === 'pro' || u.plan === 'proPlus';
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
    document.getElementById('rows').innerHTML = html || '<tr><td colspan="12" class="muted">' + (q ? 'Nobody matches that search.' : 'No users yet.') + '</td></tr>';
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
  function pick(ref) {
    var box = document.getElementById('g_ref');
    box.value = ref;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    box.focus();
  }
  function setPlan(plan) {
    var days = parseInt(document.getElementById('g_days').value, 10);
    api('/admin/api/plan', {
      ref: document.getElementById('g_ref').value,
      plan: plan,
      days: isNaN(days) ? undefined : days,
      note: document.getElementById('g_note').value || undefined,
    }).then(load);
  }
  function renderQueue(rows) {
    var host = document.getElementById('queue');
    var empty = document.getElementById('queue_empty');
    host.innerHTML = '';
    empty.className = rows.length ? 'hide' : 'muted';
    rows.forEach(function (r) {
      var box = document.createElement('div');
      box.style.cssText = 'border:1px solid var(--line);border-radius:10px;padding:12px;margin-top:10px';

      var head = document.createElement('div');
      head.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
      var code = document.createElement('b');
      code.textContent = r.barcode;
      head.appendChild(code);
      var src = document.createElement('span');
      src.className = 'pill free';
      src.textContent = r.source;
      head.appendChild(src);
      if (r.flags > 0) {
        var flag = document.createElement('span');
        flag.className = 'pill';
        flag.style.cssText = 'background:rgba(229,87,78,.18);color:#E5574E';
        flag.textContent = r.flags + ' reported';
        head.appendChild(flag);
      }
      var hits = document.createElement('span');
      hits.className = 'muted';
      hits.textContent = r.hits + ' lookups';
      head.appendChild(hits);
      box.appendChild(head);

      var scroll = document.createElement('div');
      scroll.className = 'scroll';
      scroll.style.marginTop = '8px';
      var table = document.createElement('table');
      table.innerHTML = '<thead><tr><th>Name</th><th>kcal</th><th>Protein</th><th>From</th></tr></thead>';
      var tbody = document.createElement('tbody');
      r.submissions.forEach(function (sub) {
        var it = sub.item || {};
        var tr = document.createElement('tr');
        // Built as text nodes, never as markup: a product name comes from a
        // user's photo and must never be able to run as HTML in here.
        [it.name || '?', it.calories != null ? it.calories : '?',
         it.proteinG != null ? it.proteinG : '?', sub.ref || 'anon'].forEach(function (v, i) {
          var td = document.createElement('td');
          td.textContent = String(v);
          if (i === 3) td.className = 'muted';
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      scroll.appendChild(table);
      box.appendChild(scroll);

      var actions = document.createElement('div');
      actions.className = 'row';
      actions.style.marginTop = '10px';
      var pub = document.createElement('button');
      pub.textContent = 'Publish to everyone';
      pub.addEventListener('click', function () { reviewBarcode(r.barcode, 'publish'); });
      var rej = document.createElement('button');
      rej.className = 'ghost';
      rej.textContent = 'Reject';
      rej.addEventListener('click', function () { reviewBarcode(r.barcode, 'reject'); });
      actions.appendChild(pub);
      actions.appendChild(rej);
      box.appendChild(actions);

      host.appendChild(box);
    });
  }
  // Built with DOM APIs, never interpolated markup: these strings come
  // straight from a provider's error body and must never be able to run as
  // HTML in the dashboard. (The queue renderer below learned this the hard
  // way — an escaped quote inside a template literal collapsed to a bare one
  // and broke every control on the page.)
  function renderAiFailures(summary, recent) {
    var sumHost = document.getElementById('aif_summary');
    var recHost = document.getElementById('aif_recent');
    sumHost.innerHTML = '';
    recHost.innerHTML = '';
    document.getElementById('aif_empty').style.display = recent.length ? 'none' : '';
    if (!recent.length) return;

    summary.forEach(function (row) {
      var line = document.createElement('div');
      line.style.margin = '2px 0';
      var code = document.createElement('b');
      code.textContent = row.code;
      var rest = document.createElement('span');
      rest.className = 'muted';
      rest.textContent = '  \u00d7' + row.count + ' in 24h \u00b7 last ' + new Date(row.lastAt).toLocaleString();
      line.appendChild(code);
      line.appendChild(rest);
      sumHost.appendChild(line);
    });

    var head = document.createElement('div');
    head.className = 'sub';
    head.style.margin = '12px 0 4px';
    head.textContent = 'Most recent';
    recHost.appendChild(head);

    recent.forEach(function (row) {
      var box = document.createElement('div');
      box.style.borderTop = '1px solid #eee';
      box.style.padding = '6px 0';

      var top = document.createElement('div');
      var code = document.createElement('b');
      code.textContent = row.code;
      var where = document.createElement('span');
      where.className = 'muted';
      where.textContent = '  ' + row.route + ' \u00b7 ' + new Date(row.createdAt).toLocaleString();
      top.appendChild(code);
      top.appendChild(where);

      var detail = document.createElement('div');
      detail.className = 'muted';
      detail.style.fontFamily = 'monospace';
      detail.style.fontSize = '12px';
      detail.style.wordBreak = 'break-word';
      detail.textContent = row.detail;

      box.appendChild(top);
      box.appendChild(detail);
      recHost.appendChild(box);
    });
  }
  function loadAiFailures() {
    fetch('/admin/api/ai-failures', { headers: { 'x-admin-token': tok() } })
      .then(function (r) { return r.json(); })
      .then(function (d) { renderAiFailures(d.summary || [], d.recent || []); })
      .catch(function () {});
  }
  function loadQueue() {
    fetch('/admin/api/barcode-queue', { headers: { 'x-admin-token': tok() } })
      .then(function (r) { return r.json(); })
      .then(function (d) { renderQueue(d.queue || []); })
      .catch(function () {});
  }
  function reviewBarcode(barcode, action) {
    api('/admin/api/barcode-review', { barcode: barcode, action: action }).then(loadQueue);
  }
  var WEIGHT_KINDS = ['meal','describe','equipment','exercise','bodyReading','coach','program'];
  function saveWeights() {
    var body = {};
    WEIGHT_KINDS.forEach(function (k) {
      var v = parseInt(document.getElementById('w_' + k).value, 10);
      if (v >= 1) body[k] = v;
    });
    api('/admin/api/weights', body).then(load);
  }
  function saveLimits() {
    api('/admin/api/limits', {
      free: parseInt(document.getElementById('lim_free').value, 10),
      pro: parseInt(document.getElementById('lim_pro').value, 10),
      proPlus: parseInt(document.getElementById('lim_proplus').value, 10),
      trial: parseInt(document.getElementById('lim_trial').value, 10),
    }).then(load);
  }
  function saveLocks() {
    var on = document.getElementById('locks_on').checked;
    if (on && !confirm('Turn plan locks on? Free users lose recipes, meal plans, extra schedules and the other paid features straight away.')) return;
    api('/admin/api/plan-locks', { on: on }).then(load);
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
  // ── Promotion codes ──
  var PC_ERRORS = {
    code_too_short: 'A code needs at least 3 letters or digits.',
    plan_must_be_paid: 'A code has to give Pro or Pro+.',
    percent_out_of_range: 'Percent off must be between 1 and 100.',
    duration_out_of_range: 'Days of access must be between 1 and 3650.',
    offer_required: 'A percent code needs the App Store offer code, the Google Play offer id, or both.',
    max_out_of_range: 'Max uses must be at least 1 (or blank for unlimited).',
    bad_starts_at: 'The start date is not a date.',
    bad_expires_at: 'The end date is not a date.',
    expires_before_starts: 'The end is before the start.',
    months_out_of_range: 'Months must be between 1 and 120.',
    link_to_itself: 'A code cannot be linked to itself.',
    link_loop: 'That link would loop back to this code.',
    parent_not_found: 'The linked code does not exist.',
    parent_has_no_partner: 'The linked code has no owner to pay — give it a partner first.',
    shares_over_100: 'The shares add up to more than 100%.',
    has_earnings: 'This code has earned partners money, so it is kept for their history. Turn it off instead.',
  };
  var PC_PROBLEMS = { inactive: 'off', not_started: 'not started', expired: 'ended', exhausted: 'used up' };
  var promos = [];
  function pcKind() {
    var pct = document.getElementById('pc_kind').value === 'percent';
    document.querySelectorAll('.pc-pct').forEach(function (el) { el.classList.toggle('hide', !pct); });
    document.querySelectorAll('.pc-free').forEach(function (el) { el.classList.toggle('hide', pct); });
  }
  function toLocalInput(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var off = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - off).toISOString().slice(0, 16);
  }
  function fromLocalInput(v) { return v ? new Date(v).toISOString() : null; }
  function pcMsg(text, bad) {
    var box = document.getElementById('pc_msg');
    box.textContent = text;
    box.className = bad ? 'err' : 'sub';
    box.style.marginTop = '8px';
  }
  function clearPromoForm() {
    ['pc_code','pc_pct','pc_ios','pc_android','pc_max','pc_start','pc_end','pc_note'].forEach(function (id) { document.getElementById(id).value = ''; });
    document.getElementById('pc_days').value = 30;
    document.getElementById('pc_kind').value = 'free';
    document.getElementById('pc_plan').value = 'pro';
    document.getElementById('pc_active').checked = true;
    document.getElementById('pc_code').disabled = false;
    ['pc_comm','pc_ppct','pc_gpct'].forEach(function (id) { document.getElementById(id).value = ''; });
    document.getElementById('pc_partner').value = '';
    document.getElementById('pc_term').value = 'lifetime';
    document.getElementById('pc_months').value = 12;
    document.getElementById('pc_parent').value = '';
    pcKind();
    pcTerm();
    pcParent();
  }
  function editPromo(p) {
    document.getElementById('pc_code').value = p.code;
    document.getElementById('pc_code').disabled = true;
    document.getElementById('pc_kind').value = p.kind;
    document.getElementById('pc_plan').value = p.plan;
    document.getElementById('pc_days').value = p.durationDays || 30;
    document.getElementById('pc_pct').value = p.kind === 'percent' ? p.percentOff : '';
    document.getElementById('pc_ios').value = p.offerIos || '';
    document.getElementById('pc_android').value = p.offerAndroid || '';
    document.getElementById('pc_max').value = p.maxRedemptions || '';
    document.getElementById('pc_start').value = toLocalInput(p.startsAt);
    document.getElementById('pc_end').value = toLocalInput(p.expiresAt);
    document.getElementById('pc_note').value = p.note || '';
    document.getElementById('pc_active').checked = !!p.active;
    var e = p.earning || {};
    fillCodeSelects(p.code);
    document.getElementById('pc_partner').value = e.partnerId || '';
    document.getElementById('pc_comm').value = e.partnerId ? e.commissionPct : '';
    document.getElementById('pc_term').value = e.term || 'lifetime';
    document.getElementById('pc_months').value = e.termMonths || 12;
    document.getElementById('pc_parent').value = e.parentCode || '';
    document.getElementById('pc_ppct').value = e.parentCode ? e.parentPct : '';
    document.getElementById('pc_gpct').value = e.parentCode ? e.grandparentPct : '';
    pcKind();
    pcTerm();
    pcParent();
    pcMsg('Editing ' + p.code + ' — its counters are kept when you save.', false);
    document.getElementById('codes').scrollIntoView({ behavior: 'smooth' });
  }
  function promoBody(overrides) {
    var max = parseInt(document.getElementById('pc_max').value, 10);
    var body = {
      code: document.getElementById('pc_code').value,
      kind: document.getElementById('pc_kind').value,
      plan: document.getElementById('pc_plan').value,
      durationDays: parseInt(document.getElementById('pc_days').value, 10),
      percentOff: parseInt(document.getElementById('pc_pct').value, 10),
      offerIos: document.getElementById('pc_ios').value,
      offerAndroid: document.getElementById('pc_android').value,
      maxRedemptions: isNaN(max) ? null : max,
      startsAt: fromLocalInput(document.getElementById('pc_start').value),
      expiresAt: fromLocalInput(document.getElementById('pc_end').value),
      active: document.getElementById('pc_active').checked,
      note: document.getElementById('pc_note').value,
      partnerId: document.getElementById('pc_partner').value,
      commissionPct: document.getElementById('pc_comm').value,
      term: document.getElementById('pc_term').value,
      termMonths: document.getElementById('pc_months').value,
      parentCode: document.getElementById('pc_parent').value,
      parentPct: document.getElementById('pc_ppct').value,
      grandparentPct: document.getElementById('pc_gpct').value,
    };
    Object.keys(overrides || {}).forEach(function (k) { body[k] = overrides[k]; });
    return body;
  }
  function postPromo(body) {
    return fetch('/admin/api/promo', {
      method: 'POST',
      headers: { 'x-admin-token': tok(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); });
  }
  function savePromo() {
    postPromo(promoBody()).then(function (r) {
      if (!r.ok) { pcMsg(PC_ERRORS[r.body.error] || ('Not saved: ' + (r.body.error || 'error')), true); return; }
      pcMsg('Saved ' + r.body.promo.code + '.', false);
      clearPromoForm();
      loadPromos();
    }).catch(function (e) { pcMsg('Request failed: ' + e, true); });
  }
  function togglePromo(p) {
    // The earning terms travel with the code, or saving would clear them.
    postPromo(Object.assign({}, p, p.earning || {}, { active: !p.active })).then(function (r) {
      if (!r.ok) pcMsg(PC_ERRORS[r.body.error] || ('Not saved: ' + (r.body.error || 'error')), true);
      loadPromos();
    });
  }
  function removePromo(p) {
    if (!confirm('Delete ' + p.code + ' and its ' + p.redeemedCount + ' redemption record(s)? People who already redeemed a free code keep their access.')) return;
    fetch('/admin/api/promo-delete', {
      method: 'POST',
      headers: { 'x-admin-token': tok(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: p.code }),
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok && j.error) pcMsg(PC_ERRORS[j.error] || j.error, true);
      loadPromos();
    });
  }
  function showRedemptions(p) {
    var host = document.getElementById('pc_detail');
    fetch('/admin/api/promo-redemptions?code=' + encodeURIComponent(p.code), { headers: { 'x-admin-token': tok() } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var rows = d.redemptions || [];
        var html = '<b>' + esc(p.code) + '</b> — ' + rows.length + ' redemption' + (rows.length === 1 ? '' : 's') +
          (p.kind === 'percent' ? ', ' + (p.convertedCount || 0) + ' paid' : '') +
          '<div class="scroll"><table><thead><tr><th>When</th><th>Who</th><th>Tier</th><th>' +
          (p.kind === 'percent' ? 'Paid' : 'Access until') + '</th></tr></thead><tbody>';
        rows.forEach(function (r) {
          html += '<tr><td class="muted">' + new Date(r.at).toLocaleString() + '</td>' +
            '<td>' + (r.email ? esc(r.email) : '<span style="font-family:monospace">' + esc(r.ref) + '</span>') + '</td>' +
            '<td>' + esc(r.plan) + '</td>' +
            '<td class="muted">' + (p.kind === 'percent'
              ? (r.convertedAt ? new Date(r.convertedAt).toLocaleDateString() : '—')
              : (r.until ? new Date(r.until).toLocaleDateString() : '—')) + '</td></tr>';
        });
        html += rows.length ? '' : '<tr><td colspan="4" class="muted">Nobody has used it yet.</td></tr>';
        host.innerHTML = html + '</tbody></table></div>';
        host.classList.remove('hide');
      }).catch(function () {});
  }
  function renderPromos() {
    var body = document.getElementById('pc_rows');
    body.innerHTML = '';
    if (!promos.length) {
      body.innerHTML = '<tr><td colspan="9" class="muted">No codes yet.</td></tr>';
      return;
    }
    promos.forEach(function (p) {
      var tr = document.createElement('tr');
      var tier = p.plan === 'proPlus' ? 'Pro+' : 'Pro';
      var gives = p.kind === 'free' ? tier + ' free for ' + p.durationDays + ' days' : p.percentOff + '% off ' + tier;
      var win = (p.startsAt ? new Date(p.startsAt).toLocaleDateString() : 'now') + ' → ' +
        (p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : 'no end');
      var status = p.problem ? (PC_PROBLEMS[p.problem] || p.problem) : 'live';
      tr.innerHTML =
        '<td><span style="font-family:monospace;font-weight:700">' + esc(p.code) + '</span>' + (p.note ? '<div class="muted">' + esc(p.note) + '</div>' : '') + '</td>' +
        '<td>' + esc(gives) + '</td>' +
        '<td>' + earnsCell(p) + '</td>' +
        '<td>' + p.redeemedCount + (p.maxRedemptions ? ' / ' + p.maxRedemptions : '') + '</td>' +
        '<td>' + (p.remaining == null ? '∞' : p.remaining) + '</td>' +
        '<td>' + (p.kind === 'percent' ? (p.convertedCount || 0) : '<span class="muted">—</span>') + '</td>' +
        '<td class="muted">' + esc(win) + '</td>' +
        '<td><span class="pill ' + (p.problem ? 'free' : 'pro') + '">' + esc(status) + '</span></td>' +
        '<td style="white-space:nowrap"></td>';
      var actions = tr.lastChild;
      [['Who', showRedemptions], ['Edit', editPromo], [p.active ? 'Turn off' : 'Turn on', togglePromo], ['Delete', removePromo]].forEach(function (a) {
        var b = document.createElement('button');
        b.className = 'ghost';
        b.style.marginInlineEnd = '4px';
        b.style.padding = '6px 10px';
        b.textContent = a[0];
        b.addEventListener('click', function () { a[1](p); });
        actions.appendChild(b);
      });
      body.appendChild(tr);
    });
  }
  function loadPromos() {
    fetch('/admin/api/promos', { headers: { 'x-admin-token': tok() } })
      .then(function (r) { return r.json(); })
      .then(function (d) { promos = d.promos || []; fillCodeSelects(document.getElementById('pc_code').disabled ? document.getElementById('pc_code').value : ''); renderPromos(); })
      .catch(function () {});
  }
  function pcTerm() {
    document.querySelectorAll('.pc-months').forEach(function (el) { el.classList.toggle('hide', document.getElementById('pc_term').value !== 'months'); });
  }
  function codeByName(code) { for (var i = 0; i < promos.length; i++) if (promos[i].code === code) return promos[i]; return null; }
  function partnerName(id) { for (var i = 0; i < partners.length; i++) if (partners[i].id === id) return partners[i].name; return id ? '?' : ''; }
  function pcParent() {
    var parent = codeByName(document.getElementById('pc_parent').value);
    var grand = parent && parent.earning && parent.earning.parentCode ? codeByName(parent.earning.parentCode) : null;
    document.querySelectorAll('.pc-link').forEach(function (el) { el.classList.toggle('hide', !parent); });
    document.querySelectorAll('.pc-grand').forEach(function (el) { el.classList.toggle('hide', !grand); });
    if (grand) document.getElementById('pc_glabel').textContent = partnerName(grand.earning.partnerId) + ' (via ' + grand.code + ') share %';
  }
  function fillCodeSelects(editing) {
    var sel = document.getElementById('pc_partner');
    var keep = sel.value;
    sel.innerHTML = '<option value="">— nobody —</option>';
    partners.forEach(function (pt) {
      var o = document.createElement('option');
      o.value = pt.id;
      o.textContent = pt.name + (pt.active ? '' : ' (off)');
      sel.appendChild(o);
    });
    sel.value = keep;
    var par = document.getElementById('pc_parent');
    var keepP = par.value;
    par.innerHTML = '<option value="">— not linked —</option>';
    promos.forEach(function (p) {
      // Only a code with an owner can be paid, and a code cannot follow itself.
      if (!p.earning || !p.earning.partnerId || p.code === editing) return;
      var o = document.createElement('option');
      o.value = p.code;
      o.textContent = p.code + ' — ' + partnerName(p.earning.partnerId);
      par.appendChild(o);
    });
    par.value = keepP;
    pcParent();
  }
  function money(n) { return (n < 0 ? '-' : '') + '$' + Math.abs(n || 0).toFixed(2); }
  function earnsCell(p) {
    var e = p.earning || {};
    var parts = [];
    if (e.partnerId) {
      var term = e.term === 'first' ? 'first payment' : e.term === 'months' ? e.termMonths + ' mo' : 'every payment';
      parts.push(esc(partnerName(e.partnerId)) + ' ' + e.commissionPct + '% <span class="muted">(' + term + ')</span>');
    }
    if (e.parentCode) {
      var parent = codeByName(e.parentCode);
      parts.push('<span class="muted">↳ ' + esc(parent ? partnerName(parent.earning.partnerId) : e.parentCode) + ' ' + e.parentPct + '%</span>');
      var grand = parent && parent.earning && parent.earning.parentCode ? codeByName(parent.earning.parentCode) : null;
      if (grand && e.grandparentPct > 0) parts.push('<span class="muted">↳↳ ' + esc(partnerName(grand.earning.partnerId)) + ' ' + e.grandparentPct + '%</span>');
    }
    if (p.earned) parts.push('<span class="muted">' + p.earned.buyers + ' buyer(s) · ' + p.earned.sales + ' payment(s) · ' + money(p.earned.netUsd) + ' net</span>');
    return parts.length ? parts.join('<br>') : '<span class="muted">—</span>';
  }
  // ── Partners ──
  var partners = [];
  var editingPartner = null;
  var PT_ERRORS = { name_required: 'A partner needs a name.', has_earnings: 'This partner has earnings, so they are kept for the record. Turn them off instead.', not_found: 'That partner no longer exists.' };
  function ptMsg(text, bad) {
    var box = document.getElementById('pt_msg');
    box.textContent = text;
    box.className = bad ? 'err' : 'sub';
    box.style.marginTop = '8px';
  }
  function clearPartnerForm() {
    editingPartner = null;
    ['pt_name','pt_contact','pt_note'].forEach(function (id) { document.getElementById(id).value = ''; });
    document.getElementById('pt_active').checked = true;
  }
  function postJson(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'x-admin-token': tok(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); });
  }
  function savePartner() {
    postJson('/admin/api/partner', {
      id: editingPartner,
      name: document.getElementById('pt_name').value,
      contact: document.getElementById('pt_contact').value,
      note: document.getElementById('pt_note').value,
      active: document.getElementById('pt_active').checked,
    }).then(function (r) {
      if (!r.ok) { ptMsg(PT_ERRORS[r.body.error] || ('Not saved: ' + (r.body.error || 'error')), true); return; }
      ptMsg('Saved ' + r.body.partner.name + '.', false);
      clearPartnerForm();
      loadPartners();
    });
  }
  function editPartner(pt) {
    editingPartner = pt.id;
    document.getElementById('pt_name').value = pt.name;
    document.getElementById('pt_contact').value = pt.contact || '';
    document.getElementById('pt_note').value = pt.note || '';
    document.getElementById('pt_active').checked = !!pt.active;
    ptMsg('Editing ' + pt.name + '.', false);
    document.getElementById('partners').scrollIntoView({ behavior: 'smooth' });
  }
  function partnerLink(pt) { return location.origin + '/partner/' + pt.token; }
  function copyLink(pt) {
    var link = partnerLink(pt);
    (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(
      function () { ptMsg('Copied ' + pt.name + "'s private link.", false); },
      function () { prompt('Private link for ' + pt.name, link); });
  }
  function newLink(pt) {
    if (!confirm('Make a new private link for ' + pt.name + '? The old link stops working.')) return;
    postJson('/admin/api/partner-token', { id: pt.id }).then(function () { ptMsg('New link made — copy it again.', false); loadPartners(); });
  }
  function payPartner(pt) {
    var amount = prompt('Amount paid to ' + pt.name + ' (USD). Owed now: ' + money(pt.balance.owed), pt.balance.owed > 0 ? pt.balance.owed.toFixed(2) : '');
    if (amount == null || amount === '') return;
    var note = prompt('Note (e.g. bank transfer ref) — optional', '') || '';
    postJson('/admin/api/partner-payout', { id: pt.id, amountUsd: Number(amount), note: note }).then(function (r) {
      if (!r.ok) { ptMsg(r.body.error === 'amount_out_of_range' ? 'Enter an amount above zero.' : ('Not saved: ' + r.body.error), true); return; }
      ptMsg('Recorded ' + money(Number(amount)) + ' paid to ' + pt.name + '.', false);
      loadPartners();
    });
  }
  function togglePartner(pt) {
    postJson('/admin/api/partner', Object.assign({}, pt, { active: !pt.active })).then(loadPartners);
  }
  function removePartner(pt) {
    if (!confirm('Delete ' + pt.name + '? Their codes stay, with no owner.')) return;
    postJson('/admin/api/partner-delete', { id: pt.id }).then(function (r) {
      if (!r.ok) ptMsg(PT_ERRORS[r.body.error] || r.body.error, true);
      loadPartners();
    });
  }
  function renderPartners() {
    var body = document.getElementById('pt_rows');
    body.innerHTML = '';
    if (!partners.length) {
      body.innerHTML = '<tr><td colspan="8" class="muted">No partners yet.</td></tr>';
      return;
    }
    partners.forEach(function (pt) {
      var tr = document.createElement('tr');
      var b = pt.balance || {};
      tr.innerHTML =
        '<td><b>' + esc(pt.name) + '</b>' + (pt.active ? '' : ' <span class="pill free">off</span>') + (pt.contact ? '<div class="muted">' + esc(pt.contact) + '</div>' : '') + '</td>' +
        '<td style="font-family:monospace">' + (pt.codes.length ? pt.codes.map(esc).join('<br>') : '<span class="muted">—</span>') + '</td>' +
        '<td>' + pt.sales + '</td>' +
        '<td>' + money(b.earned) + '</td>' +
        '<td class="muted">' + money(b.pending) + '</td>' +
        '<td>' + money(b.paid) + '</td>' +
        '<td><b>' + money(b.owed) + '</b></td>' +
        '<td style="white-space:nowrap"></td>';
      var actions = tr.lastChild;
      [['Page', function () { window.open(partnerLink(pt), '_blank', 'noopener'); }], ['Copy link', copyLink], ['Record payout', payPartner],
       ['Edit', editPartner], [pt.active ? 'Turn off' : 'Turn on', togglePartner], ['New link', newLink], ['Delete', removePartner]].forEach(function (a) {
        var btn = document.createElement('button');
        btn.className = 'ghost';
        btn.style.marginInlineEnd = '4px';
        btn.style.marginBottom = '4px';
        btn.style.padding = '6px 10px';
        btn.textContent = a[0];
        btn.addEventListener('click', function () { a[1](pt); });
        actions.appendChild(btn);
      });
      body.appendChild(tr);
    });
  }
  function loadPartners() {
    fetch('/admin/api/partners', { headers: { 'x-admin-token': tok() } })
      .then(function (r) { return r.json(); })
      .then(function (d) { partners = d.partners || []; renderPartners(); loadPromos(); })
      .catch(function () {});
  }
  // ── Tabs ──
  var TABS = ['overview', 'users', 'membership', 'codes', 'ai', 'content'];
  function showTab(name, focus) {
    if (TABS.indexOf(name) < 0) name = 'overview';
    TABS.forEach(function (t) {
      var tab = document.getElementById('t-' + t);
      var on = t === name;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      document.getElementById('p-' + t).hidden = !on;
    });
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    if (focus) document.getElementById('t-' + name).focus();
  }
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () { showTab(tab.getAttribute('data-tab')); });
    tab.addEventListener('keydown', function (e) {
      var i = TABS.indexOf(tab.getAttribute('data-tab'));
      if (e.key === 'ArrowRight') { e.preventDefault(); showTab(TABS[(i + 1) % TABS.length], true); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); showTab(TABS[(i + TABS.length - 1) % TABS.length], true); }
      if (e.key === 'Home') { e.preventDefault(); showTab(TABS[0], true); }
      if (e.key === 'End') { e.preventDefault(); showTab(TABS[TABS.length - 1], true); }
    });
  });
  window.addEventListener('hashchange', function () { showTab(location.hash.slice(1)); });
  showTab(location.hash.slice(1));
  function signOut() { sessionStorage.removeItem('ct'); document.getElementById('token').value = ''; location.hash = ''; location.reload(); }
  function refreshAll() { load(); }

  // ── Overview ──
  var ovDays = 30, ovView = 'growth', ovData = null, ovShowData = false;
  var VIEWS = {
    growth: { title: 'Growth', a: { key: 'newUsers', label: 'New users' }, b: { key: 'activeUsers', label: 'Daily active users' } },
    store: { title: 'Store', a: { key: 'purchases', label: 'Purchases' }, b: { key: 'cancellations', label: 'Cancellations & expiries' } },
    ai: { title: 'AI usage', a: { key: 'aiActions', label: 'AI actions' }, b: { key: 'aiFailures', label: 'AI failures' } },
  };
  var COLORS = { a: '#E0673A', b: '#5E7A0B' };
  function setRange(n) { ovDays = n; loadOverview(); }
  function setView(v) { ovView = v; renderChart(); }
  window.addEventListener('resize', function () { if (ovData) renderChart(); });
  function pressed(selector, attr, value) {
    document.querySelectorAll(selector).forEach(function (el) { el.setAttribute('aria-pressed', el.getAttribute(attr) === String(value) ? 'true' : 'false'); });
  }
  function loadOverview() {
    pressed('.chip[data-days]', 'data-days', ovDays);
    fetch('/admin/api/overview?days=' + ovDays, { headers: { 'x-admin-token': tok() } })
      .then(function (r) { return r.ok ? r.json() : r.json().then(function (j) { throw new Error(j.error || r.status); }); })
      .then(function (d) { ovData = d; renderOverview(); })
      .catch(function (e) {
        ovData = null;
        document.getElementById('ov_chart').innerHTML = '<div class="empty">The overview could not load (' + esc(String(e.message || e)) + ').</div>';
      });
  }
  function fmtDay(day, long) {
    var d = new Date(day + 'T12:00:00');
    return d.toLocaleDateString(undefined, long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' });
  }
  function when(iso) {
    var mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    if (mins < 1440) return Math.round(mins / 60) + ' h ago';
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  function sumOf(key) {
    var total = 0, seen = false;
    ovData.series.forEach(function (d) { if (d[key] != null) { total += d[key]; seen = true; } });
    return seen ? total : null;
  }
  function renderOverview() {
    var d = ovData;
    var strip = [
      ['New users', sumOf('newUsers')],
      ['Purchases', sumOf('purchases')],
      ['Renewals', sumOf('renewals')],
      ['Code redemptions', sumOf('redemptions')],
      ['AI actions', sumOf('aiActions')],
      ['AI failures', sumOf('aiFailures')],
    ];
    document.getElementById('ov_strip').innerHTML = strip.map(function (x) {
      return '<div class="stat"><b>' + (x[1] == null ? '<span class="muted" title="Not recorded yet">—</span>' : x[1].toLocaleString()) + '</b><span>' + x[0] + ' · ' + d.days + ' days</span></div>';
    }).join('');
    renderChart();
    // Needs attention
    var att = d.attention, items = [];
    if (att.queue) items.push(['bad', '!', att.queue + ' product' + (att.queue === 1 ? '' : 's') + ' waiting for review', 'Content', 'content']);
    if (att.aiFailures24h) items.push(['bad', '!', att.aiFailures24h + ' AI failure' + (att.aiFailures24h === 1 ? '' : 's') + ' in the last 24 hours', 'AI', 'ai']);
    if (att.partnersOwedUsd > 0) items.push(['todo', '$', '$' + att.partnersOwedUsd.toFixed(2) + ' owed to partners', 'Codes & partners', 'codes']);
    var todo = d.checklist.filter(function (c) { return !c.done; }).length;
    if (att.deletionRequests) items.push(['bad', '!', att.deletionRequests + ' account deletion request' + (att.deletionRequests === 1 ? '' : 's') + ' waiting', 'Users', 'users']);
    if (todo) items.push(['todo', todo, todo + ' launch step' + (todo === 1 ? '' : 's') + ' left', null, null]);
    document.getElementById('ov_attention').innerHTML = items.length ? items.map(function (it) {
      return '<li><span class="dot ' + it[0] + '" aria-hidden="true">' + it[1] + '</span><div class="grow">' + esc(it[2]) +
        (it[4] ? '<div><button class="linkbtn" style="padding:2px 0;min-height:0" onclick="showTab(&quot;' + it[4] + '&quot;, true)">Open ' + esc(it[3]) + ' →</button></div>' : '') + '</div></li>';
    }).join('') : '<li><span class="dot ok" aria-hidden="true">✓</span><div class="grow">Nothing needs you right now.</div></li>';
    setBadge('b-content', att.queue);
    setBadge('b-ai', att.aiFailures24h);
    setBadge('b-users', att.deletionRequests || 0);
    // Launch checklist
    var done = d.checklist.length - todo;
    document.getElementById('ov_check_sum').textContent = done + ' of ' + d.checklist.length + ' done';
    document.getElementById('ov_checklist').innerHTML = d.checklist.map(function (c) {
      return '<li><span class="dot ' + (c.done ? 'ok' : 'todo') + '" aria-hidden="true">' + (c.done ? '✓' : '○') + '</span><div class="grow"><span class="' + (c.done ? 'muted' : '') + '">' + esc(c.label) + '</span>' +
        '<span class="hide">' + (c.done ? ' (done)' : ' (to do)') + '</span>' + (c.done ? '' : '<div class="hint">' + esc(c.how) + '</div>') + '</div></li>';
    }).join('');
    // Recent
    var who = function (email, ref) { return email ? esc(email) : '<span class="muted" style="font-family:monospace">' + esc(ref || '—') + '</span>'; };
    var table = function (rows, head, cells, empty) {
      return rows.length ? '<table class="compact"><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { var cs = cells(r); return '<tr>' + cs.map(function (c, i) { return '<td' + (i === cs.length - 1 ? ' class="when"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>'
        : '<div class="empty">' + empty + '</div>';
    };
    var TYPE = { INITIAL_PURCHASE: 'Purchase', RENEWAL: 'Renewal', CANCELLATION: 'Cancelled', EXPIRATION: 'Expired', NON_RENEWING_PURCHASE: 'One-off purchase', PRODUCT_CHANGE: 'Plan change', UNCANCELLATION: 'Resumed', BILLING_ISSUE: 'Billing issue', TRANSFER: 'Transfer' };
    document.getElementById('ov_billing').innerHTML = table(d.recent.billing, ['Event', 'Who', 'When'], function (r) {
      return [esc(TYPE[(r.type || '').toUpperCase()] || r.type || '—'), who(r.email, r.ref), '<span class="muted">' + when(r.at) + '</span>'];
    }, 'No store events yet — they arrive once RevenueCat is connected.');
    document.getElementById('ov_redeem').innerHTML = table(d.recent.redemptions, ['Code', 'Who', 'When'], function (r) {
      return ['<b style="font-family:monospace">' + esc(r.code) + '</b>', who(r.email, r.ref), '<span class="muted">' + when(r.at) + '</span>'];
    }, 'No codes redeemed yet.');
    document.getElementById('ov_signups').innerHTML = table(d.recent.signups, ['Who', 'Device', 'Joined'], function (r) {
      return [who(r.email, r.ref), '<span class="muted">' + esc(r.device || '—') + '</span>', '<span class="muted">' + when(r.at) + '</span>'];
    }, 'No users yet.');
  }
  function setBadge(id, n) {
    var el = document.getElementById(id);
    el.textContent = n ? String(n) : '';
    el.classList.toggle('hide', !n);
  }
  function renderChart() {
    pressed('.chip[data-view]', 'data-view', ovView);
    if (!ovData) return;
    var v = VIEWS[ovView], S = ovData.series;
    document.getElementById('ov_title').textContent = v.title;
    document.getElementById('ov_legend').innerHTML =
      '<span><i style="background:' + COLORS.a + '"></i>' + v.a.label + '</span><span><i style="background:' + COLORS.b + '"></i>' + v.b.label + '</span>';
    var vals = [];
    S.forEach(function (d) { [v.a.key, v.b.key].forEach(function (k) { if (d[k] != null) vals.push(d[k]); }); });
    var host = document.getElementById('ov_chart');
    var note = document.getElementById('ov_note');
    var gaps = S.some(function (d) { return d[v.a.key] == null || d[v.b.key] == null; });
    note.textContent = gaps && ovData.trackingSince
      ? 'Daily ' + (ovView === 'growth' ? 'active users' : 'AI actions') + ' are recorded from ' + fmtDay(ovData.trackingSince, true) + '; earlier days show as a gap, not zero.'
      : gaps ? 'Daily figures start recording from today; until then they show as a gap, not zero.' : '';
    if (!vals.length) {
      host.innerHTML = '<div class="empty">Nothing recorded in this period yet.</div>';
      renderChartTable();
      return;
    }
    var max = Math.max(1, Math.max.apply(null, vals));
    // A top that halves into whole numbers, so the three gridlines read cleanly.
    var nice = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
    // Drawn at the width it is shown at, so its labels stay a readable size on a phone.
    var W = Math.max(300, Math.round(host.clientWidth || 640)), H = W < 520 ? 200 : 240, L = 36, R = 12, T = 12, B = 30;
    var x = function (i) { return L + (S.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (S.length - 1)); };
    var y = function (val) { return T + (H - T - B) * (1 - val / nice); };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(v.title + ' over the last ' + ovData.days + ' days: ' + v.a.label + ' ' + (sumOf(v.a.key) == null ? 'not recorded' : sumOf(v.a.key)) + ', ' + v.b.label + ' ' + (sumOf(v.b.key) == null ? 'not recorded' : sumOf(v.b.key)) + '. The table below has every day.') + '">';
    [0, 0.5, 1].forEach(function (f) {
      var val = Math.round(nice * f);
      svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(val) + '" y2="' + y(val) + '" stroke="#E5E8ED" stroke-dasharray="3 5"/>' +
        '<text x="' + (L - 8) + '" y="' + (y(val) + 4) + '" text-anchor="end" font-size="11" fill="#646D7A">' + val + '</text>';
    });
    var ticks = S.length <= (W < 520 ? 4 : 8) ? S.map(function (d, i) { return i; }) : [0, Math.floor((S.length - 1) / 2), S.length - 1];
    ticks.forEach(function (i) {
      svg += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="' + (i === 0 ? 'start' : i === S.length - 1 ? 'end' : 'middle') + '" font-size="11" fill="#646D7A">' + esc(fmtDay(S[i].day)) + '</text>';
    });
    // One line per unbroken run: a missing day ends the line rather than
    // being drawn as zero or bridged over.
    [['a', 3], ['b', 2]].forEach(function (pair) {
      var key = v[pair[0]].key, color = COLORS[pair[0]], run = [];
      var flush = function () {
        if (run.length === 1) svg += '<circle cx="' + run[0][0] + '" cy="' + run[0][1] + '" r="3.5" fill="' + color + '"/>';
        else if (run.length > 1) svg += '<polyline fill="none" stroke="' + color + '" stroke-width="' + pair[1] + '" stroke-linejoin="round" stroke-linecap="round" points="' + run.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '"/>';
        run = [];
      };
      S.forEach(function (d, i) { if (d[key] == null) flush(); else run.push([x(i), y(d[key])]); });
      flush();
    });
    host.innerHTML = svg + '</svg>';
    renderChartTable();
  }
  function renderChartTable() {
    var v = VIEWS[ovView], box = document.getElementById('ov_table');
    var cell = function (n) { return n == null ? '<span class="muted">not recorded</span>' : n.toLocaleString(); };
    box.innerHTML = '<table class="compact"><thead><tr><th>Day</th><th class="num">' + v.a.label + '</th><th class="num">' + v.b.label + '</th></tr></thead><tbody>' +
      ovData.series.map(function (d) { return '<tr><td>' + esc(fmtDay(d.day, true)) + '</td><td class="num">' + cell(d[v.a.key]) + '</td><td class="num">' + cell(d[v.b.key]) + '</td></tr>'; }).join('') + '</tbody></table>';
  }
  function toggleChartData() {
    ovShowData = !ovShowData;
    document.getElementById('ov_table').classList.toggle('hide', !ovShowData);
    var btn = document.getElementById('ov_toggle');
    btn.setAttribute('aria-expanded', ovShowData ? 'true' : 'false');
    btn.textContent = ovShowData ? 'Hide chart data' : 'View chart data';
  }
  if (sessionStorage.getItem('ct')) load();
</script>
</body>
</html>`;
