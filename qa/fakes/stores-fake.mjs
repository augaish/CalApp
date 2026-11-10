// A stand-in for App Store Connect, Google's token endpoint and the Play
// Developer API, for qa/store-offers-e2e.mjs. It checks what a real store
// would refuse — the token's signature and claims, the shape of every body —
// and remembers each request so the test can look at them.
//
//   node qa/fakes/stores-fake.mjs <port> <apple-public-pem-file> <google-public-pem-file>
import http from 'node:http';
import fs from 'node:fs';
import { createVerify } from 'node:crypto';

const [port, applePub, googlePub] = [Number(process.argv[2]), fs.readFileSync(process.argv[3], 'utf8'), fs.readFileSync(process.argv[4], 'utf8')];
const log = [];
const appleOffers = []; // { id, subscription, attributes, prices }
const appleCustom = []; // { id, offer, attributes }
const playOffers = new Map(); // key product/basePlan/offer → offer
let failGoogleCreate = 1; // the first offer create is refused, to test Retry

const PKG = 'com.augaish.calapp';
const SUBS = { 'sub-pm': 'calgym_pro_monthly', 'sub-py': 'calgym_pro_yearly', 'sub-em': 'calgym_essentials_monthly' };
// Saudi price points, a few hundred like Apple's, on two pages.
const SAU_POINTS = [];
for (let p = 0.99; p < 60; p += 0.5) SAU_POINTS.push({ id: `pp-sau-${Math.round(p * 100)}`, price: Math.round(p * 100) / 100 });
SAU_POINTS.push({ id: 'pp-sau-2499', price: 24.99 });

const b64json = (s) => JSON.parse(Buffer.from(s, 'base64url').toString());
function verifyJwt(token, pub, alg) {
  const [h, p, sig] = String(token || '').split('.');
  if (!sig) return null;
  const v = createVerify('SHA256');
  v.update(`${h}.${p}`);
  const ok = alg === 'ES256' ? v.verify({ key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')) : v.verify(pub, Buffer.from(sig, 'base64url'));
  if (!ok) return null;
  const header = b64json(h);
  return header.alg === alg ? { header, claims: b64json(p) } : null;
}

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};
const appleError = (res, status, detail) => send(res, status, { errors: [{ status: String(status), detail }] });

http
  .createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const url = new URL(req.url, `http://localhost:${port}`);
    const body = raw && req.headers['content-type']?.includes('json') ? JSON.parse(raw) : raw;
    if (url.pathname === '/__log') return send(res, 200, { log, appleOffers, appleCustom, playOffers: [...playOffers.values()] });
    log.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body });

    // ── Google token ──
    if (url.pathname === '/token') {
      const form = new URLSearchParams(raw);
      const jwt = verifyJwt(form.get('assertion'), googlePub, 'RS256');
      if (form.get('grant_type') !== 'urn:ietf:params:oauth:grant-type:jwt-bearer' || !jwt || jwt.claims.scope !== 'https://www.googleapis.com/auth/androidpublisher')
        return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' });
      return send(res, 200, { access_token: 'play-token', expires_in: 3600 });
    }

    // ── Play Developer API ──
    if (url.pathname.startsWith('/androidpublisher/')) {
      if (req.headers.authorization !== 'Bearer play-token') return send(res, 401, { error: { message: 'Request had invalid authentication credentials.' } });
      const base = `/androidpublisher/v3/applications/${PKG}`;
      const rest = url.pathname.slice(base.length);
      if (rest === '/subscriptions' && req.method === 'GET') return send(res, 200, { subscriptions: Object.values(SUBS).map((productId) => ({ productId })) });
      let m = rest.match(/^\/subscriptions\/([^/]+)$/);
      if (m && req.method === 'GET') {
        if (!Object.values(SUBS).includes(m[1])) return send(res, 404, { error: { message: 'Not found' } });
        const yearly = m[1].includes('yearly');
        return send(res, 200, {
          productId: m[1],
          basePlans: [
            { basePlanId: 'old-prepaid', state: 'INACTIVE', prepaidBasePlanType: {} },
            { basePlanId: yearly ? 'annual' : 'monthly', state: 'ACTIVE', autoRenewingBasePlanType: { billingPeriodDuration: yearly ? 'P1Y' : 'P1M' }, regionalConfigs: [{ regionCode: 'SA' }, { regionCode: 'US' }, { regionCode: 'AE' }], otherRegionsConfig: { usdPrice: {} } },
          ],
        });
      }
      m = rest.match(/^\/subscriptions\/([^/]+)\/basePlans\/([^/]+)\/offers(?:\/([^/:]+))?(:activate)?$/);
      if (m) {
        const [, product, plan, offerId, activate] = m;
        const key = `${product}/${plan}/${offerId ?? url.searchParams.get('offerId')}`;
        if (req.method === 'GET') return playOffers.has(key) ? send(res, 200, playOffers.get(key)) : send(res, 404, { error: { message: 'Offer not found' } });
        if (activate) {
          const o = playOffers.get(key);
          if (!o) return send(res, 404, { error: { message: 'Offer not found' } });
          o.state = 'ACTIVE';
          return send(res, 200, o);
        }
        // Create: what Play would refuse.
        if (failGoogleCreate-- > 0) return send(res, 403, { error: { message: 'The caller does not have permission' } });
        const id = url.searchParams.get('offerId');
        const problems = [];
        if (!id || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(id)) problems.push('offerId');
        if (!url.searchParams.get('regionsVersion.version')) problems.push('regionsVersion');
        if (body.offerId !== id || body.basePlanId !== plan || body.productId !== product || body.packageName !== PKG) problems.push('ids');
        if (!Array.isArray(body.phases) || body.phases.length < 1 || body.phases.length > 2) problems.push('phases');
        for (const ph of body.phases ?? []) {
          if (!/^P\d+[DWMY]$/.test(ph.duration) || !(ph.recurrenceCount >= 1)) problems.push('phase timing');
          const regions = (ph.regionalConfigs ?? []).map((r) => r.regionCode).sort().join();
          if (regions !== 'AE,SA,US') problems.push('phase regions');
          for (const r of ph.regionalConfigs ?? []) {
            const kinds = ['free', 'relativeDiscount', 'price', 'absoluteDiscount'].filter((k) => r[k] !== undefined);
            if (kinds.length !== 1 || (r.relativeDiscount !== undefined && !(r.relativeDiscount > 0 && r.relativeDiscount < 1))) problems.push('phase price');
          }
        }
        if ((body.regionalConfigs ?? []).map((r) => r.regionCode).sort().join() !== 'AE,SA,US') problems.push('regions');
        if (problems.length) return send(res, 400, { error: { message: 'Invalid offer: ' + problems.join(', ') } });
        const offer = { ...body, state: 'DRAFT' };
        playOffers.set(key, offer);
        return send(res, 200, offer);
      }
      return send(res, 404, { error: { message: `No fake for ${rest}` } });
    }

    // ── App Store Connect ──
    const jwt = verifyJwt(String(req.headers.authorization || '').replace(/^Bearer /, ''), applePub, 'ES256');
    if (!jwt || jwt.claims.aud !== 'appstoreconnect-v1' || !jwt.claims.iss || !jwt.header.kid || jwt.claims.exp - jwt.claims.iat > 20 * 60)
      return appleError(res, 401, 'Provide a properly configured and signed bearer token.');
    let m;
    if ((m = url.pathname.match(/^\/v1\/apps\/(\d+)\/subscriptionGroups$/))) {
      return send(res, 200, {
        data: [{ type: 'subscriptionGroups', id: 'grp-1' }],
        included: Object.entries(SUBS).map(([id, productId]) => ({ type: 'subscriptions', id, attributes: { productId, name: productId.replace('calgym_', '').replace('_', ' ') } })),
      });
    }
    if ((m = url.pathname.match(/^\/v1\/subscriptions\/([^/]+)\/offerCodes$/))) {
      return send(res, 200, { data: appleOffers.filter((o) => o.subscription === m[1]).map((o) => ({ type: 'subscriptionOfferCodes', id: o.id, attributes: { ...o.attributes, active: true } })) });
    }
    if ((m = url.pathname.match(/^\/v1\/subscriptions\/([^/]+)\/prices$/))) {
      return send(res, 200, {
        data: [
          { type: 'subscriptionPrices', id: 'pr-old', attributes: { startDate: '2026-01-01' }, relationships: { subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: 'pp-sau-2049' } } } },
          { type: 'subscriptionPrices', id: 'pr-now', attributes: { startDate: null }, relationships: { subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: 'pp-sau-2499' } } } },
        ].map((p) => ({ ...p, attributes: { ...p.attributes, startDate: p.id === 'pr-old' ? '2026-01-01' : '2026-09-01' } })),
        included: [
          { type: 'subscriptionPricePoints', id: 'pp-sau-2049', attributes: { customerPrice: '20.49' } },
          { type: 'subscriptionPricePoints', id: 'pp-sau-2499', attributes: { customerPrice: '24.99' } },
        ],
      });
    }
    if ((m = url.pathname.match(/^\/v1\/subscriptions\/([^/]+)\/pricePoints$/))) {
      const page = Number(url.searchParams.get('page') ?? 0);
      const slice = SAU_POINTS.slice(page * 60, page * 60 + 60);
      const next = (page + 1) * 60 < SAU_POINTS.length ? `http://localhost:${port}${url.pathname}?filter[territory]=SAU&limit=200&page=${page + 1}` : undefined;
      return send(res, 200, { data: slice.map((p) => ({ type: 'subscriptionPricePoints', id: p.id, attributes: { customerPrice: p.price.toFixed(2) } })), links: next ? { next } : {} });
    }
    if ((m = url.pathname.match(/^\/v1\/subscriptionPricePoints\/([^/]+)\/equalizations$/))) {
      return send(res, 200, {
        data: ['USA', 'ARE', 'GBR'].map((t) => ({ type: 'subscriptionPricePoints', id: `${m[1]}-${t}`, attributes: { customerPrice: '1.00' }, relationships: { territory: { data: { type: 'territories', id: t } } } })),
      });
    }
    if (url.pathname === '/v1/subscriptionOfferCodes' && req.method === 'POST') {
      const d = body.data ?? {};
      const a = d.attributes ?? {};
      const problems = [];
      for (const k of ['name', 'customerEligibilities', 'offerEligibility', 'duration', 'offerMode', 'numberOfPeriods']) if (a[k] === undefined) problems.push(k);
      if (!['PAY_AS_YOU_GO', 'PAY_UP_FRONT', 'FREE_TRIAL'].includes(a.offerMode)) problems.push('offerMode');
      if (!['THREE_DAYS', 'ONE_WEEK', 'TWO_WEEKS', 'ONE_MONTH', 'TWO_MONTHS', 'THREE_MONTHS', 'SIX_MONTHS', 'ONE_YEAR'].includes(a.duration)) problems.push('duration');
      const refs = (d.relationships?.prices?.data ?? []).map((p) => p.id).sort().join();
      const incl = (body.included ?? []).map((p) => p.id).sort().join();
      if (!refs || refs !== incl) problems.push('prices must match included');
      for (const p of body.included ?? []) {
        if (p.type !== 'subscriptionOfferCodePrices' || !/^\$\{.+\}$/.test(p.id) || !p.relationships?.territory?.data?.id) problems.push('price entry');
        if (a.offerMode !== 'FREE_TRIAL' && !p.relationships?.subscriptionPricePoint?.data?.id) problems.push('price point');
      }
      if (!SUBS[d.relationships?.subscription?.data?.id]) problems.push('subscription');
      if (appleOffers.some((o) => o.attributes.name === a.name && o.subscription === d.relationships?.subscription?.data?.id)) problems.push('name taken');
      if (problems.length) return appleError(res, 409, 'Invalid offer code: ' + problems.join(', '));
      const offer = { id: `oc-${appleOffers.length + 1}`, subscription: d.relationships.subscription.data.id, attributes: a, prices: body.included };
      appleOffers.push(offer);
      return send(res, 201, { data: { type: 'subscriptionOfferCodes', id: offer.id, attributes: a } });
    }
    if ((m = url.pathname.match(/^\/v1\/subscriptionOfferCodes\/([^/]+)\/customCodes$/))) {
      return send(res, 200, { data: appleCustom.filter((c) => c.offer === m[1]).map((c) => ({ type: 'subscriptionOfferCodeCustomCodes', id: c.id, attributes: { ...c.attributes, active: true } })) });
    }
    if (url.pathname === '/v1/subscriptionOfferCodeCustomCodes' && req.method === 'POST') {
      const a = body.data?.attributes ?? {};
      const offer = body.data?.relationships?.offerCode?.data?.id;
      if (!a.customCode || !(a.numberOfCodes > 0) || !appleOffers.some((o) => o.id === offer)) return appleError(res, 409, 'Invalid custom code');
      const c = { id: `cc-${appleCustom.length + 1}`, offer, attributes: a };
      appleCustom.push(c);
      return send(res, 201, { data: { type: 'subscriptionOfferCodeCustomCodes', id: c.id, attributes: a } });
    }
    return appleError(res, 404, `No fake for ${url.pathname}`);
  })
  .listen(port, '127.0.0.1', () => console.log(`stores fake on ${port}`));
