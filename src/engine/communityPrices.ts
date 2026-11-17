/**
 * Prices other Hunu users were quoted and chose to share. Most Ghanaian sellers publish
 * nothing online, so a price one buyer was told at Circle is the best evidence the next
 * buyer has. Reports come from Hunu's own API; when it is not configured or does not
 * answer, this source returns nothing and the rest of the search carries on.
 */
import { GeoLocation, ServiceCategory, VendorService } from './types';
import { fetchText } from './net';
import { toUSD } from './currency';
import { shopPinToVendor } from './shopPins';
import type { SellerRatingSummary } from './trust';
import {
  createRealtimeClient,
  type MaterializedLiveQuerySubscription,
  type RealtimeClient,
  type SealedLiveQuery
} from '@neon/realtime/client';

declare const __HUNU_API_URL__: string | undefined;

/** The shared price API, set at build time from HUNU_API_URL. Empty disables sharing. */
export const HUNU_API_URL: string = (typeof __HUNU_API_URL__ === 'string' ? __HUNU_API_URL__ : '').replace(/\/+$/, '');

export function communityEnabled(): boolean {
  return /^https:\/\/|^http:\/\/localhost[:/]/.test(HUNU_API_URL);
}

/** One report as the API returns it. */
export interface CommunityReport {
  id: number;
  product: string;
  amount: number;
  currency: string;
  sellerName: string;
  area: string;
  latitude: number | null;
  longitude: number | null;
  reportedAt: string;
  confirmations: number;
}

/** A shared report as a row the ranking can score. Undefined when its price cannot be converted. */
export function reportToVendor(
  report: CommunityReport,
  buyer: GeoLocation,
  category: ServiceCategory = 'General Products & Retail'
): VendorService | undefined {
  const priceUSD = toUSD(report.amount, report.currency);
  const reportedAt = Date.parse(report.reportedAt);
  if (priceUSD === undefined || !(report.amount > 0) || Number.isNaN(reportedAt)) return undefined;

  const stated = `${report.currency} ${report.amount.toLocaleString('en-US')}`;
  const placed = report.latitude !== null && report.longitude !== null;
  const area = report.area || (placed ? '' : buyer.city);

  return {
    id: `community-${report.id}`,
    name: `${report.product} (${report.sellerName})`,
    category,
    serviceType: 'local_physical',
    targetAudience: ['student', 'business', 'supply_chain'],
    location: {
      city: area || buyer.city,
      stateOrRegion: buyer.stateOrRegion,
      country: buyer.country,
      latitude: placed ? report.latitude! : buyer.latitude,
      longitude: placed ? report.longitude! : buyer.longitude,
      serviceRadiusKm: 100
    },
    pricing: {
      baseMonthlyCost: priceUSD,
      pricingModel: 'per_unit',
      currency: 'USD',
      startingTierLabel: `${stated} reported`,
      contractTerm: 'per_item'
    },
    targetIndustries: ['All'],
    targetHeadcount: ['1-10', '11-50', '51-200', '201-1000', '1000+'],
    complianceCertifications: [],
    rating: 0,
    reviewsCount: 0,
    ratingKnown: false,
    locationKnown: placed,
    dataSource: 'community',
    priceSource: 'quote',
    slaGuarantee: 'No guarantee stated',
    summary: `Another Hunu user was quoted ${stated} for ${report.product} by ${report.sellerName}${area ? ` at ${area}` : ''}. Ask the seller; prices move.`,
    keyFeatures: ['Price a buyer was quoted in person', 'Not the seller’s own listing', 'Buy in person'],
    websiteUrl: '',
    hasOfficialWebsite: false,
    quotedProduct: report.product,
    quotedPrice: { amount: report.amount, currency: report.currency },
    quotedAt: reportedAt,
    communityReport: { id: report.id, confirmations: report.confirmations },
    seller: { name: report.sellerName }
  };
}

const DEVICE_KEY = 'hunu_device_id';
let deviceId: string | undefined;

/** A random id made once per install. It names no one; the API stores only its hash. */
export async function getDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  const make = () => {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const stored = (await chrome.storage.local.get(DEVICE_KEY))[DEVICE_KEY] as string | undefined;
      deviceId = stored || make();
      if (!stored) await chrome.storage.local.set({ [DEVICE_KEY]: deviceId });
      return deviceId;
    }
    if (typeof localStorage !== 'undefined') {
      deviceId = localStorage.getItem(DEVICE_KEY) || make();
      localStorage.setItem(DEVICE_KEY, deviceId);
      return deviceId;
    }
  } catch {
    // Storage blocked: an id for this session only still lets the request through.
  }
  deviceId = make();
  return deviceId;
}

export interface CommunitySearchOptions {
  signal?: AbortSignal;
  onIssue?: (issue: string) => void;
  category?: ServiceCategory;
}

/** Shared prices for `query` near the buyer, as ranked rows. */
export async function searchCommunityPrices(
  query: string,
  buyer: GeoLocation,
  options: CommunitySearchOptions = {}
): Promise<VendorService[]> {
  if (!communityEnabled() || query.trim().length < 2) return [];
  const params = new URLSearchParams({
    q: query.trim(),
    lat: buyer.latitude.toFixed(2),
    lon: buyer.longitude.toFixed(2)
  });
  const res = await fetchText(`${HUNU_API_URL}/reports?${params}`, {
    signal: options.signal,
    timeoutMs: 5000,
    cacheTtlMs: 60 * 1000
  });
  if (!res.ok) {
    if (res.error !== 'cancelled') options.onIssue?.(`shared prices: ${res.error || `HTTP ${res.status}`}`);
    return [];
  }
  try {
    const { reports } = JSON.parse(res.text) as { reports?: CommunityReport[] };
    return (reports || [])
      .map((r) => reportToVendor(r, buyer, options.category))
      .filter((v): v is VendorService => !!v);
  } catch {
    options.onIssue?.('shared prices: unreadable answer');
    return [];
  }
}

async function post(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data?: Record<string, unknown> }> {
  if (!communityEnabled()) return { ok: false, status: 0 };
  const res = await fetchText(`${HUNU_API_URL}${path}`, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-hunu-device': await getDeviceId() },
    cacheTtlMs: 0,
    timeoutMs: 8000
  });
  let data: Record<string, unknown> | undefined;
  try {
    data = JSON.parse(res.text);
  } catch {
    data = undefined;
  }
  return { ok: res.ok, status: res.status, data };
}

/**
 * Shares a product quote the buyer recorded. Only the product, price, seller's name and
 * area, and the seller's coordinates when they came from the map go out; the buyer's own
 * details and the seller's phone stay on the device.
 */
export async function shareQuote(quote: VendorService, sellerPlaced: boolean): Promise<boolean> {
  if (!quote.quotedProduct || !quote.quotedPrice) return false;
  const sellerName = quote.name.replace(/^.*\(quoted by (.*)\)$/, '$1');
  const res = await post('/reports', {
    product: quote.quotedProduct,
    amount: quote.quotedPrice.amount,
    currency: quote.quotedPrice.currency,
    sellerName,
    area: quote.location.city,
    // The buyer's own position is never sent as the seller's.
    latitude: sellerPlaced ? quote.location.latitude : null,
    longitude: sellerPlaced ? quote.location.longitude : null
  });
  return res.ok;
}

/** A report row as Realtime delivers it: int8 and numeric as strings, timestamptz as a Date. */
interface LiveReportRow {
  id: string;
  product: string;
  amount: string;
  currency: string;
  seller_name: string;
  area: string;
  latitude: number | null;
  longitude: number | null;
  reported_at: Date | string;
  confirmations: number;
}

export function liveRowToReport(row: LiveReportRow): CommunityReport {
  return {
    id: Number(row.id),
    product: row.product,
    amount: Number(row.amount),
    currency: String(row.currency).trim(),
    sellerName: row.seller_name,
    area: row.area,
    latitude: row.latitude,
    longitude: row.longitude,
    reportedAt: new Date(row.reported_at).toISOString(),
    confirmations: row.confirmations
  };
}

type Sealed = SealedLiveQuery<LiveReportRow>;

async function fetchSealed(query: string, buyer: GeoLocation): Promise<{ url: string; sealed: Sealed }> {
  // A sealed query is a bearer token: it travels in a POST body, is never cached and never logged.
  const res = await fetchText(`${HUNU_API_URL}/reports/live`, {
    method: 'POST',
    body: JSON.stringify({ q: query, lat: Number(buyer.latitude.toFixed(2)), lon: Number(buyer.longitude.toFixed(2)) }),
    headers: { 'content-type': 'application/json' },
    cacheTtlMs: 0,
    timeoutMs: 8000
  });
  if (!res.ok) throw new Error(`live prices: ${res.error || `HTTP ${res.status}`}`);
  const body = JSON.parse(res.text) as { url?: string; sealed?: Sealed };
  if (!body.url || !body.sealed) throw new Error('live prices: unreadable answer');
  return { url: body.url, sealed: body.sealed };
}

/** One Realtime connection for the page; every subscription shares it. */
let realtimeClient: { url: string; client: RealtimeClient } | undefined;
function clientFor(url: string): RealtimeClient {
  if (!realtimeClient || realtimeClient.url !== url) {
    realtimeClient?.client.close();
    realtimeClient = { url, client: createRealtimeClient({ url, logLevel: 'error' }) };
  }
  return realtimeClient.client;
}

const RENEW_EARLY_MS = 10_000;
const RETRY_MS = 2_000;

/**
 * Keeps the shared prices for `query` up to date while the results are on screen: a
 * price another buyer shares, confirms or flags shows up without searching again.
 * `onRows` gets the full current list each time it changes. Returns a stop function.
 * Live updates are an extra: if they cannot start or they fail, the prices fetched by
 * the search stay as they are.
 */
export function watchCommunityPrices(
  query: string,
  buyer: GeoLocation,
  onRows: (vendors: VendorService[]) => void,
  category?: ServiceCategory
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let subscription: MaterializedLiveQuerySubscription<LiveReportRow> | undefined;
  if (!communityEnabled() || query.trim().length < 2) return () => undefined;

  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    subscription?.unsubscribe();
  };

  const scheduleRenewal = (expiresAt: number) => {
    clearTimeout(timer);
    if (stopped) return;
    timer = setTimeout(async () => {
      try {
        const next = await fetchSealed(query.trim(), buyer);
        if (stopped || !subscription) return;
        scheduleRenewal(next.sealed.expiresAt);
        // A rejected renewal means the subscription has failed: stop quietly.
        subscription.renew(next.sealed).catch(stop);
      } catch {
        if (!stopped) timer = setTimeout(() => scheduleRenewal(Date.now() + RENEW_EARLY_MS), RETRY_MS);
      }
    }, Math.max(0, expiresAt - Date.now() - RENEW_EARLY_MS));
  };

  void (async () => {
    try {
      const { url, sealed } = await fetchSealed(query.trim(), buyer);
      if (stopped) return;
      subscription = clientFor(url).subscribe(sealed);
      subscription.onChange((snapshot) => {
        if (stopped) return;
        if (snapshot.status === 'error') {
          stop();
          return;
        }
        if (!snapshot.data) return;
        onRows(
          snapshot.data
            .map((row) => reportToVendor(liveRowToReport(row), buyer, category))
            .filter((v): v is VendorService => !!v)
        );
      });
      scheduleRenewal(sealed.expiresAt);
    } catch {
      // No live updates; the search's own fetch stands.
    }
  })();

  return stop;
}

export type VoteResult = 'counted' | 'already' | 'refused' | 'failed';

function voteResult(res: { ok: boolean; status: number; data?: Record<string, unknown> }): VoteResult {
  if (res.ok) return res.data?.counted ? 'counted' : 'already';
  return res.status === 409 || res.status === 429 ? 'refused' : 'failed';
}

/** Agrees with a shared price, or says it is wrong. Each device counts once per report. */
export async function voteOnReport(reportId: number, kind: 'confirm' | 'flag'): Promise<VoteResult> {
  return voteResult(await post(`/reports/${reportId}/${kind}`));
}

// --- Shops pinned on the map ----------------------------------------------------------

/** One shared shop pin as the API returns it. */
export interface CommunityShop {
  id: number;
  name: string;
  sells: string;
  area: string;
  latitude: number;
  longitude: number;
  pinnedAt: string;
  confirmations: number;
}

export function communityShopToVendor(shop: CommunityShop, buyer: GeoLocation, category?: ServiceCategory): VendorService | undefined {
  const pinnedAt = Date.parse(shop.pinnedAt);
  return shopPinToVendor({
    name: shop.name,
    sells: shop.sells,
    area: shop.area,
    latitude: shop.latitude,
    longitude: shop.longitude,
    buyer,
    category,
    pinnedAt: Number.isNaN(pinnedAt) ? undefined : pinnedAt,
    shared: { id: shop.id, confirmations: shop.confirmations }
  });
}

/** Shops other buyers pinned near the buyer that sell something matching `query`. */
export async function searchCommunityShops(
  query: string,
  buyer: GeoLocation,
  options: CommunitySearchOptions = {}
): Promise<VendorService[]> {
  if (!communityEnabled() || query.trim().length < 2) return [];
  const params = new URLSearchParams({ q: query.trim(), lat: buyer.latitude.toFixed(2), lon: buyer.longitude.toFixed(2) });
  const res = await fetchText(`${HUNU_API_URL}/shops?${params}`, { signal: options.signal, timeoutMs: 5000, cacheTtlMs: 60 * 1000 });
  if (!res.ok) {
    if (res.error !== 'cancelled') options.onIssue?.(`shared shops: ${res.error || `HTTP ${res.status}`}`);
    return [];
  }
  try {
    const { shops } = JSON.parse(res.text) as { shops?: CommunityShop[] };
    return (shops || [])
      .map((s) => communityShopToVendor(s, buyer, options.category))
      .filter((v): v is VendorService => !!v);
  } catch {
    options.onIssue?.('shared shops: unreadable answer');
    return [];
  }
}

/**
 * Shares a shop the buyer pinned. Only its name, what it sells, the area and the pin go
 * out; the phone number the buyer noted stays on the device.
 */
export async function shareShop(pin: VendorService, sells: string): Promise<boolean> {
  if (pin.dataSource !== 'pinned') return false;
  const res = await post('/shops', {
    name: pin.name,
    sells,
    area: pin.location.city,
    latitude: pin.location.latitude,
    longitude: pin.location.longitude
  });
  return res.ok;
}

/** Agrees that a shared shop is there, or says the pin is wrong. */
export async function voteOnShop(shopId: number, kind: 'confirm' | 'flag'): Promise<VoteResult> {
  return voteResult(await post(`/shops/${shopId}/${kind}`));
}

// --- Ratings from Hunu users -------------------------------------------------------------

export interface SellerRatingNote {
  id: number;
  stars: number;
  note: string;
  at: string;
}

export type SellerRatings = Map<string, SellerRatingSummary & { notes?: string[]; noteItems?: SellerRatingNote[] }>;

/** What Hunu users said about these sellers, in one request. */
export async function fetchSellerRatings(keys: string[], signal?: AbortSignal): Promise<SellerRatings> {
  const out: SellerRatings = new Map();
  const unique = [...new Set(keys)].slice(0, 40);
  if (!communityEnabled() || unique.length === 0) return out;
  const res = await fetchText(`${HUNU_API_URL}/sellers/ratings?keys=${encodeURIComponent(unique.join(','))}`, {
    signal,
    timeoutMs: 5000,
    cacheTtlMs: 60 * 1000
  });
  if (!res.ok) return out;
  try {
    const { ratings } = JSON.parse(res.text) as { ratings?: Record<string, { average: number; count: number; notes?: SellerRatingNote[] }> };
    for (const [key, r] of Object.entries(ratings || {})) {
      out.set(key, { average: r.average, count: r.count, notes: (r.notes || []).map((n) => n.note), noteItems: r.notes || [] });
    }
  } catch {
    // An unreadable answer is treated as no ratings.
  }
  return out;
}

/** Rates a seller after buying. Rating the same seller again changes the rating. */
export async function rateSeller(sellerKey: string, stars: number, note: string): Promise<'saved' | 'refused' | 'failed'> {
  const res = await post('/sellers/rate', { sellerKey, stars, note });
  if (res.ok) return 'saved';
  return res.status === 400 || res.status === 429 ? 'refused' : 'failed';
}

/** Reports a rating as wrong or abusive. */
export async function flagSellerRating(ratingId: number): Promise<VoteResult> {
  return voteResult(await post(`/sellers/ratings/${ratingId}/flag`));
}

// --- Exact delivery from Shopify stores' checkouts ----------------------------------------

const SHOPIFY_DELIVERY_STORES = new Set(['compughana.com', 'telefonika.com', 'starlite.com.gh', 'store-usa.arduino.cc', 'shop.pimoroni.com', 'thepihut.com']);
const COUNTRY_CODE: Record<string, string> = { ghana: 'GH' };

/**
 * Asks Hunu's API for the delivery charge each Shopify store's own checkout gives for
 * the buyer's region, and records it on the row as the seller's stated delivery. Rows
 * the store will not quote stay as they were (their policy or a range applies).
 */
export async function enrichShopifyDelivery(vendors: VendorService[], buyer: GeoLocation, signal?: AbortSignal, limit = 8): Promise<void> {
  const country = COUNTRY_CODE[(buyer.country || '').trim().toLowerCase()];
  if (!communityEnabled() || !country || !buyer.stateOrRegion) return;
  const targets = vendors
    .filter((v) => !v.delivery && v.dataSource === 'web')
    .map((v) => {
      const url = v.exactOrderUrl || v.websiteUrl || '';
      const m = url.match(/^https?:\/\/(?:www\.)?([^/]+)\/(?:[a-z-]+\/)?products\/([a-z0-9-]+)/i);
      return m && SHOPIFY_DELIVERY_STORES.has(m[1].toLowerCase()) ? { v, store: m[1].toLowerCase(), handle: m[2], url } : undefined;
    })
    .filter((t): t is NonNullable<typeof t> => !!t)
    .slice(0, limit);

  await Promise.all(
    targets.map(async ({ v, store, handle, url }) => {
      const res = await fetchText(`${HUNU_API_URL}/delivery/shopify`, {
        method: 'POST',
        body: JSON.stringify({ store, handle, country, region: buyer.stateOrRegion }),
        headers: { 'content-type': 'application/json' },
        signal,
        timeoutMs: 9000,
        cacheTtlMs: 6 * 60 * 60 * 1000
      });
      if (!res.ok) return;
      try {
        const { rates } = JSON.parse(res.text) as { rates?: { name: string; amount: number; currency: string }[] };
        const cheapest = (rates || []).sort((a, b) => a.amount - b.amount)[0];
        if (!cheapest) return;
        // A long rate name is the store's own condition: "Free Delivery only applies to ...".
        const condition = cheapest.name.length > 24 ? cheapest.name.replace(/\.$/, '') : undefined;
        v.delivery = {
          kind: cheapest.amount === 0 ? 'free' : 'exact',
          amount: cheapest.amount,
          currency: cheapest.currency,
          basis: `${store} checkout for ${buyer.stateOrRegion}`,
          condition,
          sourceUrl: url,
          checkedAt: Date.now()
        };
      } catch {
        // Leave the row to its policy or range.
      }
    })
  );
}
