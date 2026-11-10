import { createSign } from 'node:crypto';

/**
 * Makes a Calgym code's matching offer in each store, so a code is one form
 * in admin instead of three places by hand (App Store guideline 3.1.1 means
 * the store, not the app, has to give the discount or free time).
 *
 * Apple: an offer code on the subscription (App Store Connect API), with a
 * custom code of the same name. Google: a developer-determined offer on the
 * subscription's base plan (Play Developer API), activated. Both are made
 * idempotently: an offer that already exists under that name is reused, so a
 * failed half can simply be retried.
 *
 * Keys live only in the server's environment:
 *   ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY (the .p8, App Manager role), ASC_APP_ID
 *   GOOGLE_PLAY_SERVICE_ACCOUNT (the service account's JSON key), GOOGLE_PLAY_PACKAGE
 */

export type StoreName = 'apple' | 'google';

/** What the code gives, as the stores need it. */
export interface OfferSpec {
  /** The Calgym code, e.g. AHMED30: the Apple offer and custom code, and (lower case) the Google offer id. */
  code: string;
  /** The store product, e.g. calgym_pro_monthly. */
  productId: string;
  kind: 'percent' | 'free';
  /** 1–99 for a discount. */
  percentOff: number;
  /** How many billing periods the discount lasts (a monthly plan: months; a yearly plan: years). */
  periods: number;
  /** Free time in days (free codes). */
  freeDays: number;
  /** How many people may use it (Apple needs a number). */
  maxRedemptions: number | null;
  /** When the code stops working, ISO; Apple takes the date. */
  expiresAt: string | null;
}

export interface StoreResult {
  store: StoreName;
  ok: boolean;
  /** What the store now has, in a sentence for the admin. */
  detail: string;
  /** The store's own ids, for the record and the check. */
  ids?: Record<string, string>;
  /** The value to keep in the code's iOS / Android offer field. */
  offerRef?: string;
}

export class StoreError extends Error {
  constructor(
    readonly store: StoreName,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const env = (k: string) => (process.env[k] ?? '').trim();

// ── Apple: App Store Connect API ─────────────────────────────────────────

const ASC_BASE = () => env('ASC_BASE_URL') || 'https://api.appstoreconnect.apple.com';
const ascAppId = () => env('ASC_APP_ID') || '6793969631';
/** Calgym's prices are set in Saudi riyals; the other countries follow Apple's equalized prices. */
const ANCHOR_TERRITORY = 'SAU';

export function appleConfigured(): boolean {
  return !!(env('ASC_KEY_ID') && env('ASC_ISSUER_ID') && env('ASC_PRIVATE_KEY'));
}

function pem(key: string): string {
  // Railway variables often carry the .p8 with literal \n.
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
}

/**
 * The .p8 as a key Node can read, however it was pasted: with its line
 * breaks turned into spaces or \n, wrapped in quotes, or without the BEGIN
 * and END lines. Only the base64 body matters; it is re-wrapped as PKCS#8.
 */
export function appleKeyPem(key: string): string {
  const body = key
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [A-Z ]+-----/, '')
    .replace(/-----END [A-Z ]+-----/, '')
    .replace(/[^A-Za-z0-9+/=]/g, '');
  return `-----BEGIN PRIVATE KEY-----\n${(body.match(/.{1,64}/g) ?? []).join('\n')}\n-----END PRIVATE KEY-----\n`;
}

const b64url = (v: Buffer | string) => Buffer.from(v).toString('base64url');

/** A 15-minute ES256 token, as App Store Connect requires. */
export function appleToken(now = Date.now()): string {
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: env('ASC_KEY_ID'), typ: 'JWT' }));
  const iat = Math.floor(now / 1000);
  const payload = b64url(JSON.stringify({ iss: env('ASC_ISSUER_ID'), iat, exp: iat + 15 * 60, aud: 'appstoreconnect-v1' }));
  const signer = createSign('SHA256');
  signer.update(`${header}.${payload}`);
  const sig = signer.sign({ key: appleKeyPem(env('ASC_PRIVATE_KEY')), dsaEncoding: 'ieee-p1363' });
  return `${header}.${payload}.${b64url(sig)}`;
}

interface JsonApiDoc {
  data?: unknown;
  included?: { type: string; id: string; attributes?: Record<string, unknown>; relationships?: Record<string, { data?: { id: string; type: string } | null }> }[];
  links?: { next?: string };
  errors?: { title?: string; detail?: string; code?: string }[];
}

async function asc(path: string, init: { method?: string; body?: unknown } = {}): Promise<JsonApiDoc> {
  const url = path.startsWith('http') ? path : `${ASC_BASE()}${path}`;
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${appleToken()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  const json = (text ? JSON.parse(text) : {}) as JsonApiDoc;
  if (!res.ok) {
    const e = json.errors?.[0];
    throw new StoreError('apple', e?.detail || e?.title || `App Store Connect answered ${res.status}`, res.status);
  }
  return json;
}

/** Every page of a list. */
async function ascAll(path: string): Promise<{ data: { id: string; type: string; attributes?: Record<string, unknown>; relationships?: Record<string, { data?: { id: string } | null }> }[]; included: NonNullable<JsonApiDoc['included']> }> {
  const data: { id: string; type: string; attributes?: Record<string, unknown> }[] = [];
  const included: NonNullable<JsonApiDoc['included']> = [];
  let next: string | undefined = path;
  for (let page = 0; next && page < 30; page++) {
    const doc = await asc(next);
    data.push(...((doc.data as typeof data) ?? []));
    included.push(...(doc.included ?? []));
    next = doc.links?.next;
  }
  return { data, included };
}

/** The app's subscriptions by product id. */
async function appleSubscriptions(): Promise<Map<string, { id: string; name: string }>> {
  const groups = await ascAll(`/v1/apps/${ascAppId()}/subscriptionGroups?include=subscriptions&limit=50&limit[subscriptions]=50`);
  const out = new Map<string, { id: string; name: string }>();
  for (const item of groups.included) {
    if (item.type === 'subscriptions' && typeof item.attributes?.productId === 'string') {
      out.set(item.attributes.productId, { id: item.id, name: String(item.attributes.name ?? item.attributes.productId) });
    }
  }
  return out;
}

/** The subscription's current price point in the anchor territory. */
async function appleCurrentPrice(subscriptionId: string): Promise<{ pointId: string; price: number }> {
  const list = await ascAll(
    `/v1/subscriptions/${subscriptionId}/prices?filter[territory]=${ANCHOR_TERRITORY}&include=subscriptionPricePoint&limit=50`,
  );
  const today = new Date().toISOString().slice(0, 10);
  const current = list.data
    .map((p) => ({ start: (p.attributes?.startDate as string | null) ?? '0000-00-00', point: p.relationships?.subscriptionPricePoint?.data?.id }))
    .filter((p) => p.point && p.start <= today)
    .sort((a, b) => b.start.localeCompare(a.start))[0];
  if (!current?.point) throw new StoreError('apple', `The subscription has no price in Saudi Arabia (${ANCHOR_TERRITORY}).`);
  const point = list.included.find((i) => i.type === 'subscriptionPricePoints' && i.id === current.point);
  return { pointId: current.point, price: Number(point?.attributes?.customerPrice ?? NaN) };
}

/** The price point in the anchor territory closest to `target`, below the full price. */
export function closestPoint(points: { id: string; price: number }[], target: number, full: number): { id: string; price: number } | null {
  const usable = points.filter((p) => p.price > 0 && p.price < full);
  if (!usable.length) return null;
  return usable.reduce((best, p) => (Math.abs(p.price - target) < Math.abs(best.price - target) ? p : best));
}

/** Apple's offer durations, from free days. */
export function appleFreeDuration(days: number): string | null {
  const map: Record<number, string> = { 3: 'THREE_DAYS', 7: 'ONE_WEEK', 14: 'TWO_WEEKS', 30: 'ONE_MONTH', 31: 'ONE_MONTH', 60: 'TWO_MONTHS', 90: 'THREE_MONTHS', 180: 'SIX_MONTHS', 365: 'ONE_YEAR' };
  return map[days] ?? null;
}

const isYearly = (productId: string) => /year|annual/i.test(productId);

/** The JSON body for a new offer code — exported so the shape is tested. */
export function appleOfferBody(spec: OfferSpec, subscriptionId: string, prices: { territory: string; pointId: string | null }[]) {
  const free = spec.kind === 'free';
  const duration = free ? appleFreeDuration(spec.freeDays) : isYearly(spec.productId) ? 'ONE_YEAR' : 'ONE_MONTH';
  if (!duration) throw new StoreError('apple', 'Apple offers free time of 3 days, 1 or 2 weeks, or 1, 2, 3, 6 or 12 months.');
  return {
    data: {
      type: 'subscriptionOfferCodes',
      attributes: {
        name: spec.code,
        // New subscribers and people who had Calgym before; current members keep their plan.
        customerEligibilities: ['NEW', 'EXPIRED'],
        // A free code replaces the 14-day trial; a discount comes after it.
        offerEligibility: free ? 'REPLACE_INTRO_OFFERS' : 'STACK_WITH_INTRO_OFFERS',
        offerMode: free ? 'FREE_TRIAL' : 'PAY_AS_YOU_GO',
        duration,
        numberOfPeriods: free ? 1 : Math.max(1, Math.min(12, spec.periods)),
      },
      relationships: {
        subscription: { data: { type: 'subscriptions', id: subscriptionId } },
        prices: { data: prices.map((_, i) => ({ type: 'subscriptionOfferCodePrices', id: `\${price${i}}` })) },
      },
    },
    included: prices.map((p, i) => ({
      type: 'subscriptionOfferCodePrices',
      id: `\${price${i}}`,
      relationships: {
        territory: { data: { type: 'territories', id: p.territory } },
        ...(p.pointId ? { subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: p.pointId } } } : {}),
      },
    })),
  };
}

export async function createAppleOffer(spec: OfferSpec): Promise<StoreResult> {
  const subs = await appleSubscriptions();
  const sub = subs.get(spec.productId);
  if (!sub) throw new StoreError('apple', `No subscription ${spec.productId} in App Store Connect.`);

  // Already made (a retry): reuse it.
  const existing = await ascAll(`/v1/subscriptions/${sub.id}/offerCodes?limit=200`);
  let offer = existing.data.find((o) => o.attributes?.name === spec.code);
  let price = '';
  if (!offer) {
    const current = await appleCurrentPrice(sub.id);
    let anchorPoint: { id: string; price: number } = { id: current.pointId, price: current.price };
    if (spec.kind === 'percent') {
      const target = current.price * (1 - spec.percentOff / 100);
      const points = await ascAll(`/v1/subscriptions/${sub.id}/pricePoints?filter[territory]=${ANCHOR_TERRITORY}&limit=200`);
      const best = closestPoint(points.data.map((p) => ({ id: p.id, price: Number(p.attributes?.customerPrice ?? NaN) })), target, current.price);
      if (!best) throw new StoreError('apple', 'Apple has no lower price to offer for this subscription.');
      anchorPoint = best;
      price = ` · SAR ${current.price.toFixed(2)} → SAR ${best.price.toFixed(2)}`;
    }
    // The same price level in every other country, as Apple equalizes it.
    const eq = await ascAll(`/v1/subscriptionPricePoints/${anchorPoint.id}/equalizations?include=territory&limit=200`);
    const prices = [
      { territory: ANCHOR_TERRITORY, pointId: spec.kind === 'percent' ? anchorPoint.id : null },
      ...eq.data
        .map((p) => ({ territory: p.relationships?.territory?.data?.id ?? '', pointId: spec.kind === 'percent' ? p.id : null }))
        .filter((p) => p.territory && p.territory !== ANCHOR_TERRITORY),
    ];
    const made = await asc('/v1/subscriptionOfferCodes', { method: 'POST', body: appleOfferBody(spec, sub.id, prices) });
    offer = made.data as typeof offer;
  }
  if (!offer) throw new StoreError('apple', 'App Store Connect did not return the new offer.');

  const codes = await ascAll(`/v1/subscriptionOfferCodes/${offer.id}/customCodes?limit=200`);
  let custom = codes.data.find((c) => String(c.attributes?.customCode ?? '').toUpperCase() === spec.code);
  if (!custom) {
    const made = await asc('/v1/subscriptionOfferCodeCustomCodes', {
      method: 'POST',
      body: {
        data: {
          type: 'subscriptionOfferCodeCustomCodes',
          attributes: {
            customCode: spec.code,
            numberOfCodes: spec.maxRedemptions ?? 10000,
            ...(spec.expiresAt ? { expirationDate: spec.expiresAt.slice(0, 10) } : {}),
          },
          relationships: { offerCode: { data: { type: 'subscriptionOfferCodes', id: offer.id } } },
        },
      },
    });
    custom = made.data as typeof custom;
  }
  return {
    store: 'apple',
    ok: true,
    detail: `offer ${spec.code} on ${sub.name}${price}, custom code ${spec.code}`,
    ids: { subscription: sub.id, offer: offer.id, customCode: custom?.id ?? '' },
    offerRef: spec.code,
  };
}

/** Whether the offer and its custom code are there and active. */
export async function checkAppleOffer(code: string, productId: string): Promise<StoreResult> {
  const sub = (await appleSubscriptions()).get(productId);
  if (!sub) return { store: 'apple', ok: false, detail: `No subscription ${productId} in App Store Connect.` };
  const offers = await ascAll(`/v1/subscriptions/${sub.id}/offerCodes?limit=200`);
  const offer = offers.data.find((o) => o.attributes?.name === code);
  if (!offer) return { store: 'apple', ok: false, detail: `No offer named ${code} on ${sub.name}.` };
  const codes = await ascAll(`/v1/subscriptionOfferCodes/${offer.id}/customCodes?limit=200`);
  const custom = codes.data.find((c) => String(c.attributes?.customCode ?? '').toUpperCase() === code);
  if (!custom) return { store: 'apple', ok: false, detail: `Offer ${code} has no custom code ${code} yet.` };
  const active = offer.attributes?.active !== false && custom.attributes?.active !== false;
  return { store: 'apple', ok: active, detail: active ? `offer ${code} and custom code are active` : `offer ${code} is turned off in App Store Connect` };
}

/** A read-only call that proves the key works. */
export async function testApple(): Promise<StoreResult> {
  const subs = await appleSubscriptions();
  return { store: 'apple', ok: true, detail: `connected · ${subs.size} subscription${subs.size === 1 ? '' : 's'} found` };
}

// ── Google: Play Developer API ───────────────────────────────────────────

const PLAY_BASE = () => env('GOOGLE_PLAY_BASE_URL') || 'https://androidpublisher.googleapis.com';
const playPackage = () => env('GOOGLE_PLAY_PACKAGE') || 'com.augaish.calapp';
/** The regions version Play prices are given against (see the API's regionsVersion). */
const REGIONS_VERSION = '2022/02';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function serviceAccount(): ServiceAccount | null {
  const raw = env('GOOGLE_PLAY_SERVICE_ACCOUNT');
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    return sa.client_email && sa.private_key ? sa : null;
  } catch {
    return null;
  }
}

export function googleConfigured(): boolean {
  return !!serviceAccount();
}

let googleCache: { token: string; until: number } | null = null;

async function googleToken(): Promise<string> {
  if (googleCache && googleCache.until > Date.now() + 60_000) return googleCache.token;
  const sa = serviceAccount();
  if (!sa) throw new StoreError('google', 'GOOGLE_PLAY_SERVICE_ACCOUNT is not set or not valid JSON.');
  const tokenUri = env('GOOGLE_TOKEN_URL') || sa.token_uri || 'https://oauth2.googleapis.com/token';
  const iat = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: tokenUri, iat, exp: iat + 3600 }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${head}.${claims}`);
  const assertion = `${head}.${claims}.${b64url(signer.sign(pem(sa.private_key)))}`;
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    signal: AbortSignal.timeout(20000),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token) throw new StoreError('google', json.error_description || `Google sign-in answered ${res.status}`, res.status);
  googleCache = { token: json.access_token, until: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return json.access_token;
}

async function play<T>(path: string, init: { method?: string; body?: unknown; allow404?: boolean } = {}): Promise<T | null> {
  const res = await fetch(`${PLAY_BASE()}/androidpublisher/v3/applications/${playPackage()}${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${await googleToken()}`, 'Content-Type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 404 && init.allow404) return null;
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new StoreError('google', json.error?.message || `Google Play answered ${res.status}`, res.status);
  return json;
}

interface PlayBasePlan {
  basePlanId: string;
  state?: string;
  autoRenewingBasePlanType?: { billingPeriodDuration?: string };
  regionalConfigs?: { regionCode: string }[];
  otherRegionsConfig?: unknown;
}

/** Google's offer ids: lower case letters, digits and hyphens, starting with a letter or digit. */
export function googleOfferId(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 63);
}

/** ISO 8601 period for free days: whole months when it divides, else days. */
export function googleFreePeriod(days: number): string {
  if (days % 365 === 0) return `P${days / 365}Y`;
  if (days % 30 === 0) return `P${days / 30}M`;
  if (days % 7 === 0) return `P${days / 7}W`;
  return `P${days}D`;
}

/** The JSON body for a new offer — exported so the shape is tested. */
export function googleOfferBody(spec: OfferSpec, plan: PlayBasePlan) {
  const free = spec.kind === 'free';
  const regions = (plan.regionalConfigs ?? []).map((r) => r.regionCode);
  if (!regions.length) throw new StoreError('google', `Base plan ${plan.basePlanId} has no countries.`);
  const yearly = (plan.autoRenewingBasePlanType?.billingPeriodDuration ?? '').endsWith('Y');
  const phasePrice = (regionCode?: string) =>
    free ? { ...(regionCode ? { regionCode } : {}), free: {} } : { ...(regionCode ? { regionCode } : {}), relativeDiscount: spec.percentOff / 100 };
  return {
    packageName: playPackage(),
    productId: spec.productId,
    basePlanId: plan.basePlanId,
    offerId: googleOfferId(spec.code),
    phases: [
      {
        duration: free ? googleFreePeriod(spec.freeDays) : yearly ? 'P1Y' : 'P1M',
        recurrenceCount: free ? 1 : Math.max(1, Math.min(12, spec.periods)),
        regionalConfigs: regions.map((r) => phasePrice(r)),
        ...(plan.otherRegionsConfig ? { otherRegionsConfig: phasePrice() } : {}),
      },
    ],
    regionalConfigs: regions.map((regionCode) => ({ regionCode, newSubscriberAvailability: true })),
    ...(plan.otherRegionsConfig ? { otherRegionsConfig: { otherRegionsNewSubscriberAvailability: true } } : {}),
    // No targeting: a developer-determined offer, which the app applies when the code is typed.
    offerTags: [{ tag: 'calgym-code' }],
  };
}

async function googleBasePlan(productId: string): Promise<PlayBasePlan> {
  const sub = await play<{ basePlans?: PlayBasePlan[] }>(`/subscriptions/${productId}`, { allow404: true });
  if (!sub) throw new StoreError('google', `No subscription ${productId} in Google Play.`);
  const plan = (sub.basePlans ?? []).find((p) => p.state === 'ACTIVE' && p.autoRenewingBasePlanType);
  if (!plan) throw new StoreError('google', `${productId} has no active auto-renewing base plan.`);
  return plan;
}

export async function createGoogleOffer(spec: OfferSpec): Promise<StoreResult> {
  const plan = await googleBasePlan(spec.productId);
  const offerId = googleOfferId(spec.code);
  const path = `/subscriptions/${spec.productId}/basePlans/${plan.basePlanId}/offers`;
  let offer = await play<{ state?: string }>(`${path}/${offerId}`, { allow404: true });
  if (!offer) {
    offer = await play<{ state?: string }>(`${path}?offerId=${encodeURIComponent(offerId)}&regionsVersion.version=${encodeURIComponent(REGIONS_VERSION)}`, {
      method: 'POST',
      body: googleOfferBody(spec, plan),
    });
  }
  if (offer?.state !== 'ACTIVE') {
    offer = await play<{ state?: string }>(`${path}/${offerId}:activate`, {
      method: 'POST',
      body: { packageName: playPackage(), productId: spec.productId, basePlanId: plan.basePlanId, offerId },
    });
  }
  return {
    store: 'google',
    ok: offer?.state === 'ACTIVE',
    detail: offer?.state === 'ACTIVE' ? `offer ${offerId} active on ${spec.productId} (${plan.basePlanId})` : `offer ${offerId} made but not active (${offer?.state ?? 'unknown'})`,
    ids: { basePlan: plan.basePlanId, offer: offerId },
    offerRef: offerId,
  };
}

export async function checkGoogleOffer(code: string, productId: string): Promise<StoreResult> {
  const plan = await googleBasePlan(productId);
  const offerId = googleOfferId(code);
  const offer = await play<{ state?: string }>(`/subscriptions/${productId}/basePlans/${plan.basePlanId}/offers/${offerId}`, { allow404: true });
  if (!offer) return { store: 'google', ok: false, detail: `No offer ${offerId} on ${productId}.` };
  return { store: 'google', ok: offer.state === 'ACTIVE', detail: offer.state === 'ACTIVE' ? `offer ${offerId} is active` : `offer ${offerId} is ${String(offer.state ?? 'not active').toLowerCase()}` };
}

export async function testGoogle(): Promise<StoreResult> {
  const list = await play<{ subscriptions?: unknown[] }>('/subscriptions?pageSize=50');
  const n = list?.subscriptions?.length ?? 0;
  return { store: 'google', ok: true, detail: `connected · ${n} subscription${n === 1 ? '' : 's'} found` };
}

/** Runs one store's step, turning any failure into a result the admin can read. */
export async function attempt(store: StoreName, run: () => Promise<StoreResult>): Promise<StoreResult> {
  try {
    return await run();
  } catch (err) {
    return { store, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
