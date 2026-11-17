/**
 * Checks on what a client sends, kept free of the database so they can be tested on
 * their own. Everything a report carries is shown to other buyers, so it is trimmed,
 * bounded and stripped of anything that looks like contact details.
 */
import { contentTokens } from '../../src/engine/text';

/** Reports older than this are not served: a market price goes stale fast. */
export const REPORT_MAX_AGE_DAYS = 60;
/** A report with this many "wrong price" flags is hidden. */
export const HIDE_AFTER_FLAGS = 2;
/** Most reports one device may file in a day. */
export const REPORTS_PER_DEVICE_PER_DAY = 20;
/** Most reports one network address may file in a day (several phones can share one). */
export const REPORTS_PER_IP_PER_DAY = 60;
/** Most confirmations and flags one device may cast in a day. */
export const VOTES_PER_DEVICE_PER_DAY = 100;
/** How far from the buyer a report may be and still be served. */
export const NEARBY_KM = 60;
export const MAX_RESULTS = 30;

export interface NewReport {
  product: string;
  productTokens: string[];
  amount: number;
  currency: string;
  sellerName: string;
  area: string;
  latitude: number | null;
  longitude: number | null;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** Phone numbers and emails do not belong in a shared report: the seller did not publish them. */
const CONTACT = /\+?\d[\d\s-]{7,}\d|[^\s@]+@[^\s@]+\.[a-z]{2,}/gi;

function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>?/g, ' ')
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(CONTACT, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function coordinate(value: unknown, limit: number): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : NaN;
  return Number.isFinite(n) && Math.abs(n) <= limit ? Math.round(n * 1000) / 1000 : null;
}

/** The words a product is matched on, the same way the extension matches a search. */
export function productTokens(product: string): string[] {
  return contentTokens(product).slice(0, 12);
}

export function checkReport(body: unknown): Checked<NewReport> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Expected a JSON object.' };
  const b = body as Record<string, unknown>;

  const product = cleanText(b.product, 120);
  const tokens = productTokens(product);
  if (product.length < 2 || tokens.length === 0) return { ok: false, error: 'Name the product.' };

  const amount = typeof b.amount === 'number' ? b.amount : parseFloat(String(b.amount));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
    return { ok: false, error: 'The price must be a number above zero.' };
  }

  const currency = typeof b.currency === 'string' ? b.currency.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: 'The currency must be a three-letter code.' };

  const sellerName = cleanText(b.sellerName, 80);
  if (!sellerName) return { ok: false, error: 'Name the seller.' };

  const latitude = coordinate(b.latitude, 90);
  const longitude = coordinate(b.longitude, 180);

  return {
    ok: true,
    value: {
      product,
      productTokens: tokens,
      amount: Math.round(amount * 100) / 100,
      currency,
      sellerName,
      area: cleanText(b.area, 80),
      latitude: latitude !== null && longitude !== null ? latitude : null,
      longitude: latitude !== null && longitude !== null ? longitude : null
    }
  };
}

/** Most shop pins one device may share in a day. */
export const SHOPS_PER_DEVICE_PER_DAY = 10;
/** Most shop pins one network address may share in a day. */
export const SHOPS_PER_IP_PER_DAY = 30;

export interface NewShop {
  name: string;
  sells: string;
  tokens: string[];
  area: string;
  latitude: number;
  longitude: number;
}

/** A shared shop must say where it is: a pin with no place is no use on a map. */
export function checkShop(body: unknown): Checked<NewShop> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Expected a JSON object.' };
  const b = body as Record<string, unknown>;
  const name = cleanText(b.name, 80);
  if (name.length < 2) return { ok: false, error: 'Name the shop.' };
  const sells = cleanText(b.sells, 160);
  const latitude = coordinate(b.latitude, 90);
  const longitude = coordinate(b.longitude, 180);
  if (latitude === null || longitude === null || (latitude === 0 && longitude === 0)) {
    return { ok: false, error: 'Pin the shop on the map.' };
  }
  const tokens = [...new Set([...productTokens(name), ...contentTokens(sells)])].slice(0, 24);
  if (tokens.length === 0) return { ok: false, error: 'Say what the shop sells.' };
  return { ok: true, value: { name, sells, tokens, area: cleanText(b.area, 80), latitude, longitude } };
}

/** Most seller ratings one device may write or change in a day. */
export const RATINGS_PER_DEVICE_PER_DAY = 30;
/** Most seller ratings one network address may write or change in a day. */
export const RATINGS_PER_IP_PER_DAY = 90;
/** Most sellers asked about in one batch. */
export const MAX_RATING_KEYS = 40;

/** Seller keys are built by the client's `sellerKey`: "jiji:3930573", "osm:12345", "store:jumia.com.gh". */
export function checkSellerKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const key = value.trim().toLowerCase();
  return /^(osm|pin|name|store|[a-z0-9-]{2,40}|[a-z0-9.-]{3,80}):[a-z0-9 |._:-]{1,120}$/.test(key) ? key : undefined;
}

export interface NewRating {
  sellerKey: string;
  stars: number;
  note: string;
}

export function checkRating(body: unknown): Checked<NewRating> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Expected a JSON object.' };
  const b = body as Record<string, unknown>;
  const sellerKey = checkSellerKey(b.sellerKey);
  if (!sellerKey) return { ok: false, error: 'Unknown seller.' };
  const stars = typeof b.stars === 'number' ? b.stars : parseInt(String(b.stars), 10);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return { ok: false, error: 'Give 1 to 5 stars.' };
  return { ok: true, value: { sellerKey, stars, note: cleanText(b.note, 200) } };
}

export interface ReportQuery {
  tokens: string[];
  latitude: number | null;
  longitude: number | null;
}

export function checkQuery(params: { q?: string; lat?: string; lon?: string }): Checked<ReportQuery> {
  const tokens = productTokens(cleanText(params.q, 120));
  if (tokens.length === 0) return { ok: false, error: 'Search for a product.' };
  const latitude = coordinate(params.lat, 90);
  const longitude = coordinate(params.lon, 180);
  return {
    ok: true,
    value: {
      tokens,
      latitude: latitude !== null && longitude !== null ? latitude : null,
      longitude: latitude !== null && longitude !== null ? longitude : null
    }
  };
}

/** A device id is a random token the extension makes once; anything else is refused. */
export function checkDeviceId(value: string | undefined | null): string | undefined {
  return value && /^[A-Za-z0-9_-]{16,64}$/.test(value) ? value : undefined;
}

/** Report ids are positive integers. */
export function checkReportId(value: string): number | undefined {
  return /^\d{1,15}$/.test(value) ? Number(value) : undefined;
}

/** Degrees of latitude and longitude that cover `km` around a point, for a cheap box filter. */
export function boundingBox(latitude: number, longitude: number, km: number) {
  const dLat = km / 111;
  const dLon = km / (111 * Math.max(0.1, Math.cos((latitude * Math.PI) / 180)));
  return { minLat: latitude - dLat, maxLat: latitude + dLat, minLon: longitude - dLon, maxLon: longitude + dLon };
}
