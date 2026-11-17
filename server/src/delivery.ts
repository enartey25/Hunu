/**
 * Exact delivery charges from a Shopify store's own checkout.
 *
 * Shopify stores (CompuGhana, Telefonika, Starlite, The Pi Hut, Pimoroni, the Arduino
 * store) calculate delivery for an address only once an item is in a cart. Doing that
 * from the buyer's browser would put the item in the buyer's real cart on that store,
 * so it is done here instead: a fresh, empty session per lookup, the item added, the
 * rates read for the buyer's region, and the session dropped.
 *
 * Only stores on the allowlist can be asked, so this cannot be pointed at other sites.
 */

export interface ShopifyRate {
  name: string;
  amount: number;
  currency: string;
}

/** The Shopify stores Hunu searches. Kept in step with src/engine/storeSources.ts. */
export const SHOPIFY_STORES = new Set([
  'compughana.com',
  'telefonika.com',
  'starlite.com.gh',
  'store-usa.arduino.cc',
  'shop.pimoroni.com',
  'thepihut.com'
]);

/** Postcodes Shopify accepts for a country. Ghana's checkout takes the region prefix of a GhanaPost GPS code. */
const POSTCODE: Record<string, string> = { GH: 'GA' };
const COUNTRY_NAMES: Record<string, string> = { GH: 'Ghana', NG: 'Nigeria', KE: 'Kenya', GB: 'United Kingdom', US: 'United States' };

const UA = 'Mozilla/5.0 (compatible; HunuDeliveryCheck/1.0; +https://hunu.app)';
const TIMEOUT_MS = 8000;
const CACHE_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; rates: ShopifyRate[] }>();

function cookieHeader(res: Response, jar: Map<string, string>): void {
  const set = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() || [];
  for (const line of set) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

const jarText = (jar: Map<string, string>) => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

async function call(url: string, jar: Map<string, string>, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': UA, accept: 'application/json', cookie: jarText(jar), ...(init.headers || {}) }
  });
  cookieHeader(res, jar);
  return res;
}

export interface DeliveryQuery {
  store: string;
  handle: string;
  /** ISO country code, "GH". */
  country: string;
  /** Region as Shopify names it: "Greater Accra". */
  region: string;
}

export function checkDeliveryQuery(body: unknown): DeliveryQuery | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  const store = String(b.store || '').toLowerCase().replace(/^www\./, '');
  const handle = String(b.handle || '');
  const country = String(b.country || '').toUpperCase();
  const region = String(b.region || '').replace(/[^A-Za-z -]/g, '').trim().slice(0, 40);
  if (!SHOPIFY_STORES.has(store) || !/^[a-z0-9-]{1,200}$/i.test(handle) || !POSTCODE[country] || !region) return undefined;
  return { store, handle, country, region };
}

/** The store's checkout rates for one item to one region. Empty when the store quotes delivery per order. */
export async function shopifyRates(q: DeliveryQuery): Promise<ShopifyRate[]> {
  const key = `${q.store}|${q.handle}|${q.country}|${q.region}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rates;

  const origin = `https://${q.store}`;
  const jar = new Map<string, string>();
  const product = await call(`${origin}/products/${q.handle}.js`, jar);
  if (!product.ok) throw new Error(`product ${product.status}`);
  const variant = ((await product.json()) as { variants?: { id: number; available?: boolean }[] }).variants?.find(
    (v) => v.available !== false
  );
  if (!variant) throw new Error('no variant');

  const added = await call(`${origin}/cart/add.js`, jar, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items: [{ id: variant.id, quantity: 1 }] })
  });
  if (!added.ok) throw new Error(`cart ${added.status}`);

  const params = new URLSearchParams({
    'shipping_address[country]': COUNTRY_NAMES[q.country],
    'shipping_address[province]': q.region,
    'shipping_address[zip]': POSTCODE[q.country]
  });
  const ratesRes = await call(`${origin}/cart/shipping_rates.json?${params}`, jar);
  if (!ratesRes.ok) throw new Error(`rates ${ratesRes.status}`);
  const body = (await ratesRes.json()) as { shipping_rates?: { name: string; price: string; currency: string }[] };
  const rates = (body.shipping_rates || [])
    .map((r) => ({ name: String(r.name || '').slice(0, 160), amount: Number(r.price), currency: String(r.currency || '').toUpperCase() }))
    .filter((r) => Number.isFinite(r.amount) && r.amount >= 0 && /^[A-Z]{3}$/.test(r.currency));
  cache.set(key, { at: Date.now(), rates });
  return rates;
}
