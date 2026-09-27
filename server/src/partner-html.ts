/**
 * A partner's own page: their codes, what each has brought in, what they have
 * earned, what is still in the refund window, what has been paid and what is
 * owed. Read-only, reached only by the secret link the admin shares, and it
 * never names or identifies a buyer.
 */
import { HOLD_DAYS } from './partners.js';
import type { PartnerReport } from './db.js';

const STYLE = `
  :root { --bg:#F5F3FA; --card:#fff; --text:#2A2440; --muted:#6B6480; --line:#E6E1F0; --primary:#6D5AAB; --good:#1F8A5B; --bad:#B4412F; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#17141F; --card:#221D2E; --text:#F2EFF8; --muted:#A69FBA; --line:#332C44; --primary:#A895E8; --good:#5FCB97; --bad:#F08A78; }
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); padding:24px 16px;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; line-height:1.5; }
  .wrap { max-width:760px; margin:0 auto; }
  header { margin-bottom:16px; }
  h1 { font-size:24px; margin:0; }
  .muted { color:var(--muted); font-size:13px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:18px; margin-bottom:14px; }
  h2 { font-size:15px; margin:0 0 10px; }
  .stats { display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px; }
  .stat b { display:block; font-size:22px; font-variant-numeric:tabular-nums; }
  .stat span { color:var(--muted); font-size:13px; }
  .owed b { color:var(--primary); }
  .scroll { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; font-size:14px; font-variant-numeric:tabular-nums; }
  th, td { text-align:start; padding:8px 6px; border-bottom:1px solid var(--line); white-space:nowrap; }
  th { color:var(--muted); font-weight:600; font-size:12px; }
  td.num, th.num { text-align:end; }
  .neg { color:var(--bad); }
  .code { font-family:ui-monospace,Menlo,monospace; font-weight:700; }
  .pill { display:inline-block; font-size:11px; padding:2px 8px; border-radius:99px; background:var(--line); color:var(--muted); }
  .empty { color:var(--muted); font-size:14px; margin:0; }
`;

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const usd = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const LEVEL = ['Your codes', 'Partners you brought', "Their partners"];

function termText(term: string, months: number | null): string {
  if (term === 'first') return 'first payment';
  if (term === 'months') return `${months} month${months === 1 ? '' : 's'}`;
  return 'every payment';
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${esc(title)} · Calgym partners</title>
<style>${STYLE}</style>
</head>
<body><div class="wrap">${body}</div></body>
</html>`;
}

export function partnerNotFoundHtml(): string {
  return page('Link not found', `<div class="card"><h1>This link isn't active</h1>
    <p class="muted">It may have been replaced with a new one. Ask Calgym for your current link.</p></div>`);
}

export function partnerPageHtml(r: PartnerReport): string {
  const b = r.balance;
  const stats = `<div class="card"><div class="stats">
      <div class="stat"><b>${usd(b.earned)}</b><span>Earned in total</span></div>
      <div class="stat"><b>${usd(b.pending)}</b><span>Last ${HOLD_DAYS} days (can still be refunded)</span></div>
      <div class="stat"><b>${usd(b.paid)}</b><span>Paid to you</span></div>
      <div class="stat owed"><b>${usd(b.owed)}</b><span>Owed to you now</span></div>
    </div></div>`;

  const codes = r.codes.length
    ? `<div class="scroll"><table><thead><tr>
        <th>Code</th><th class="num">Buyer discount</th><th class="num">Your share</th><th>For</th>
        <th class="num">Used</th><th class="num">Buyers</th><th class="num">Payments</th><th class="num">Earned</th></tr></thead><tbody>
        ${r.codes
          .map(
            (c) => `<tr>
          <td><span class="code">${esc(c.code)}</span>${c.active ? '' : ' <span class="pill">off</span>'}</td>
          <td class="num">${c.kind === 'free' ? 'free trial' : `${c.percentOff}%`}</td>
          <td class="num">${c.commissionPct}%</td>
          <td>${esc(termText(c.term, c.termMonths))}</td>
          <td class="num">${c.redemptions}</td>
          <td class="num">${c.buyers}</td>
          <td class="num">${c.sales}</td>
          <td class="num">${usd(c.earnedUsd)}</td></tr>`,
          )
          .join('')}
      </tbody></table></div>`
    : `<p class="empty">No codes yet.</p>`;

  const levels = r.byLevel.length
    ? `<table><thead><tr><th>From</th><th class="num">Payments</th><th class="num">Earned</th></tr></thead><tbody>
        ${r.byLevel.map((l) => `<tr><td>${LEVEL[l.level] ?? ''}</td><td class="num">${l.sales}</td><td class="num">${usd(l.earnedUsd)}</td></tr>`).join('')}
      </tbody></table>`
    : `<p class="empty">Nothing yet — earnings appear here after the first payment through your code.</p>`;

  const recent = r.recent.length
    ? `<div class="scroll"><table><thead><tr><th>Date</th><th>Code</th><th>From</th><th class="num">Payment (net)</th><th class="num">Share</th><th class="num">You</th></tr></thead><tbody>
        ${r.recent
          .map(
            (l) => `<tr>
          <td>${day(l.at)}${l.kind === 'refund' ? ' <span class="pill">refund</span>' : ''}</td>
          <td class="code">${esc(l.code)}</td>
          <td>${LEVEL[l.level] ?? ''}</td>
          <td class="num">${usd(l.netUsd)}</td>
          <td class="num">${l.pct}%</td>
          <td class="num ${l.amountUsd < 0 ? 'neg' : ''}">${usd(l.amountUsd)}</td></tr>`,
          )
          .join('')}
      </tbody></table></div>`
    : `<p class="empty">No payments yet.</p>`;

  const payouts = r.payouts.length
    ? `<table><thead><tr><th>Date</th><th>Note</th><th class="num">Amount</th></tr></thead><tbody>
        ${r.payouts.map((p) => `<tr><td>${day(p.at)}</td><td>${esc(p.note ?? '')}</td><td class="num">${usd(p.amountUsd)}</td></tr>`).join('')}
      </tbody></table>`
    : `<p class="empty">No payouts yet.</p>`;

  return page(
    r.partner.name,
    `<header><h1>${esc(r.partner.name)}</h1>
      <p class="muted">Your Calgym partner page. Amounts are in US dollars, counted on what each payment brings in after the app store's fee and tax.</p></header>
     ${stats}
     <div class="card"><h2>Your codes</h2>${codes}</div>
     <div class="card"><h2>Where it came from</h2>${levels}</div>
     <div class="card"><h2>Recent payments</h2>${recent}</div>
     <div class="card"><h2>Payouts</h2>${payouts}</div>
     <p class="muted">Payments from the last ${HOLD_DAYS} days are shown as pending until the store's refund window closes. Buyers are never identified here.</p>`,
  );
}
