import { isKnownCurrency, toUSD } from './currency';
import { contentTokens, htmlToText } from './text';

export interface ParsedPrice {
  amount: number;
  currency: string;
  amountUSD: number;
  /** The price as written, for display: "GH₵450.00". */
  raw: string;
  /** Position in the source text. */
  index: number;
}

const SYMBOLS: [string, string][] = [
  ['US$', 'USD'],
  ['C$', 'CAD'],
  ['CA$', 'CAD'],
  ['A$', 'AUD'],
  ['AU$', 'AUD'],
  ['GH₵', 'GHS'],
  ['GHS', 'GHS'],
  ['GHC', 'GHS'],
  ['GH¢', 'GHS'],
  ['₵', 'GHS'],
  ['USD', 'USD'],
  ['GBP', 'GBP'],
  ['EUR', 'EUR'],
  ['NGN', 'NGN'],
  ['KES', 'KES'],
  ['KSh', 'KES'],
  ['ZAR', 'ZAR'],
  ['CAD', 'CAD'],
  ['AUD', 'AUD'],
  ['INR', 'INR'],
  ['AED', 'AED'],
  ['£', 'GBP'],
  ['€', 'EUR'],
  ['₦', 'NGN'],
  ['₹', 'INR'],
  ['$', 'USD']
];

const SYMBOL_TO_CODE = new Map(SYMBOLS.map(([s, c]) => [s.toLowerCase(), c]));
const SYMBOL_ALT = SYMBOLS.map(([s]) => s.replace(/[$.*+?^{}()|[\]\\]/g, '\\$&')).join('|');
const NUMBER = '\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+,\\d{2}(?!\\d)|\\d+(?:\\.\\d{1,2})?';

// Symbol or code before the number ("$24.90", "GHS 450"), or a code or word after it ("450 GHS", "20 cedis").
const PRICE_RE = new RegExp(
  `(?:(?<![A-Za-z])(${SYMBOL_ALT})\\s?(${NUMBER}))|(?:(${NUMBER})\\s?(€|£|₵|₦|(?:USD|GHS|GHC|GBP|EUR|NGN|KES|ZAR|CAD|AUD|INR|AED|cedis|dollars|euros|pounds|naira)\\b))`,
  'gi'
);

const WORD_TO_CODE: Record<string, string> = {
  cedis: 'GHS',
  dollars: 'USD',
  euros: 'EUR',
  pounds: 'GBP',
  naira: 'NGN',
  ghc: 'GHS'
};

/** ccTLDs where a bare "$" is not a US dollar. */
const DOLLAR_BY_TLD: Record<string, string> = { ca: 'CAD', au: 'AUD' };

function parseNumber(text: string): number {
  // "12,99" is a decimal comma; "1,299" and "1,299.00" are thousands separators.
  if (/^\d+,\d{2}$/.test(text)) return parseFloat(text.replace(',', '.'));
  return parseFloat(text.replace(/,/g, ''));
}

/** Finds every price in a piece of text and converts each to USD. */
export function parsePrices(text: string, domain: string = ''): ParsedPrice[] {
  const out: ParsedPrice[] = [];
  const tld = domain.split('.').pop() || '';
  PRICE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PRICE_RE.exec(text)) !== null) {
    const symbol = m[1];
    const numberText = m[2] || m[3];
    const word = m[4];
    let currency: string | undefined;
    if (symbol) {
      currency = SYMBOL_TO_CODE.get(symbol.toLowerCase());
      if (symbol === '$' && DOLLAR_BY_TLD[tld]) currency = DOLLAR_BY_TLD[tld];
    } else if (word) {
      currency = SYMBOL_TO_CODE.get(word.toLowerCase()) || WORD_TO_CODE[word.toLowerCase()] || word.toUpperCase();
    }
    if (!currency || !isKnownCurrency(currency)) continue;
    const amount = parseNumber(numberText);
    const amountUSD = toUSD(amount, currency);
    if (amountUSD === undefined || !(amount > 0)) continue;
    out.push({ amount, currency, amountUSD, raw: m[0].trim(), index: m.index });
  }
  return out;
}

/** Words before an amount that mean it is not the price of the item. */
const NOT_ITEM_PRICE = /(save|off|shipping|delivery|over|orders?|above|coupon|credit|cashback|was|from only|deposit|per month|\/mo)\s*(?:of|up to|on|for)?\s*$/i;

/**
 * The most likely item price in a search snippet. Skips amounts that are savings,
 * shipping thresholds or struck-through old prices, and amounts too small or large to be real.
 */
export function pickListingPrice(text: string, domain: string = ''): ParsedPrice | undefined {
  for (const price of parsePrices(text, domain)) {
    const before = text.slice(Math.max(0, price.index - 22), price.index);
    if (NOT_ITEM_PRICE.test(before)) continue;
    if (price.amountUSD < 0.05 || price.amountUSD > 250000) continue;
    return price;
  }
  return undefined;
}

export interface DiscountMention {
  percent: number;
  /** True for "up to 40% off", which is a ceiling, not the discount on this item. */
  upTo: boolean;
}

export function findDiscount(text: string): DiscountMention | undefined {
  const m = text.match(/(up to\s+)?(\d{1,2})\s?%\s+(?:off|discount|savings?|cheaper)\b|\bsave\s+(up to\s+)?(\d{1,2})\s?%/i);
  if (!m) return undefined;
  const percent = parseInt(m[2] || m[4], 10);
  if (!(percent > 0 && percent < 100)) return undefined;
  return { percent, upTo: !!(m[1] || m[3]) };
}

export function findPromoCode(text: string): string | undefined {
  const m = text.match(/\b(?:promo code|coupon code|discount code|voucher code|use code|with code|code)[:\s]+["“']?([A-Z0-9][A-Z0-9_-]{3,14})\b/);
  if (!m) return undefined;
  // All letters must be capitals and it must not be an ordinary word in a heading.
  return /[A-Z]/.test(m[1]) && !/^(HERE|TODAY|NOW|ONLINE|CHECKOUT|BELOW|ABOVE)$/.test(m[1]) ? m[1] : undefined;
}

// --- Structured data on a product page ------------------------------------------------

export interface PageOffer {
  name?: string;
  price?: ParsedPrice;
  availability?: 'in_stock' | 'out_of_stock' | 'preorder' | 'unknown';
  rating?: number;
  reviewsCount?: number;
  brand?: string;
  seller?: string;
  /** Delivery charges the page states (schema.org shippingDetails), one per destination. */
  shipping?: PageShipping[];
  /** How the offer was read. */
  source: 'jsonld' | 'meta';
}

export interface PageShipping {
  amount: number;
  currency: string;
  /** ISO country code or name the rate is for; absent when the page does not say. */
  country?: string;
  /** Days in transit, when stated. */
  transitDays?: [number, number];
}

/** schema.org OfferShippingDetails on one offer, as plain rates. */
function readShipping(offer: Json): PageShipping[] {
  const out: PageShipping[] = [];
  for (const d of asArray(offer.shippingDetails as Json | Json[])) {
    if (!d || typeof d !== 'object') continue;
    const rate = asArray(d.shippingRate as Json | Json[])[0];
    const amount = num(rate?.value) ?? (rate && String(rate.value) === '0' ? 0 : undefined);
    const currency = String(rate?.currency || offer.priceCurrency || '').toUpperCase();
    if (amount === undefined || amount < 0 || !currency) continue;
    const dest = asArray(d.shippingDestination as Json | Json[])[0];
    const country = dest ? String(dest.addressCountry || '').trim() || undefined : undefined;
    const t = (d.deliveryTime as Json | undefined)?.transitTime as Json | undefined;
    const lo = num(t?.minValue);
    const hi = num(t?.maxValue);
    out.push({ amount, currency, country, transitDays: lo !== undefined && hi !== undefined ? [lo, hi] : undefined });
  }
  return out;
}

const COUNTRY_CODES: Record<string, string> = {
  ghana: 'GH', nigeria: 'NG', kenya: 'KE', 'united states': 'US', 'united kingdom': 'GB', togo: 'TG', 'south africa': 'ZA'
};

/** The stated delivery rate for the buyer's country. A rate with no destination counts only for a domestic seller. */
export function shippingFor(rates: PageShipping[] | undefined, buyerCountry: string, sellerIsDomestic: boolean): PageShipping | undefined {
  if (!rates || rates.length === 0) return undefined;
  const code = COUNTRY_CODES[buyerCountry.trim().toLowerCase()];
  const matches = (c: string) => c.toUpperCase() === code || c.toLowerCase() === buyerCountry.trim().toLowerCase();
  const forBuyer = rates.filter((r) => r.country && matches(r.country));
  const pool = forBuyer.length > 0 ? forBuyer : sellerIsDomestic ? rates.filter((r) => !r.country) : [];
  return pool.sort((a, b) => a.amount - b.amount)[0];
}

type Json = Record<string, unknown>;

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function hasType(node: Json, type: string): boolean {
  return asArray(node['@type'] as string | string[]).some((t) => String(t).toLowerCase() === type.toLowerCase());
}

function collectProducts(node: unknown, out: Json[], depth = 0): void {
  if (!node || depth > 6) return;
  if (Array.isArray(node)) {
    for (const item of node) collectProducts(item, out, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;
  const obj = node as Json;
  if (hasType(obj, 'Product') || hasType(obj, 'ProductGroup')) out.push(obj);
  for (const key of ['@graph', 'mainEntity', 'itemListElement', 'item', 'hasVariant']) {
    if (obj[key]) collectProducts(obj[key], out, depth + 1);
  }
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const n = parseNumber(value.replace(/[^\d.,]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function readAvailability(value: unknown): PageOffer['availability'] {
  const v = String(value || '').toLowerCase();
  if (!v) return undefined;
  if (v.includes('outofstock') || v.includes('soldout') || v.includes('discontinued')) return 'out_of_stock';
  if (v.includes('preorder') || v.includes('backorder')) return 'preorder';
  if (v.includes('instock') || v.includes('limitedavailability') || v.includes('onlineonly')) return 'in_stock';
  return 'unknown';
}

function offerFromProduct(product: Json): PageOffer {
  const offer: PageOffer = { source: 'jsonld' };
  if (typeof product.name === 'string') offer.name = htmlToText(product.name);

  const brand = product.brand as Json | string | undefined;
  if (typeof brand === 'string') offer.brand = brand;
  else if (brand && typeof brand.name === 'string') offer.brand = brand.name;

  // An offer, a list of offers, or an AggregateOffer with a low price. Take the cheapest in stock.
  let best: { amount: number; currency: string; availability: PageOffer['availability'] } | undefined;
  const queue = asArray(product.offers as Json | Json[]);
  for (const variant of asArray(product.hasVariant as Json | Json[])) {
    queue.push(...asArray(variant?.offers as Json | Json[]));
  }
  for (const o of queue) {
    if (!o || typeof o !== 'object') continue;
    const spec = asArray(o.priceSpecification as Json | Json[])[0];
    const amount = num(o.price) ?? num(o.lowPrice) ?? num(spec?.price);
    const currency = String(o.priceCurrency || spec?.priceCurrency || '').toUpperCase();
    if (amount === undefined || amount <= 0 || !currency) continue;
    const availability = readAvailability(o.availability);
    const better =
      !best ||
      (best.availability === 'out_of_stock' && availability !== 'out_of_stock') ||
      (availability !== 'out_of_stock' && amount < best.amount);
    if (better) {
      best = { amount, currency, availability };
      const shipping = readShipping(o);
      offer.shipping = shipping.length > 0 ? shipping : undefined;
    }
    const seller = o.seller as Json | undefined;
    if (seller && typeof seller.name === 'string') offer.seller = seller.name;
  }
  if (best) {
    const amountUSD = toUSD(best.amount, best.currency);
    if (amountUSD !== undefined) {
      offer.price = {
        amount: best.amount,
        currency: best.currency,
        amountUSD,
        raw: `${best.currency} ${best.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        index: 0
      };
    }
    offer.availability = best.availability;
  }

  const rating = product.aggregateRating as Json | undefined;
  if (rating) {
    const value = num(rating.ratingValue);
    const scale = num(rating.bestRating) ?? 5;
    const count = num(rating.reviewCount) ?? num(rating.ratingCount);
    if (value !== undefined && value > 0 && scale > 0) {
      offer.rating = Math.round(((value / scale) * 5) * 10) / 10;
      offer.reviewsCount = count !== undefined ? Math.round(count) : 0;
    }
  }
  return offer;
}

function metaContent(html: string, names: string[]): string | undefined {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const a = html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]*content=["']([^"']+)["']`, 'i'));
    if (a) return a[1];
    const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${escaped}["']`, 'i'));
    if (b) return b[1];
  }
  return undefined;
}

/** Share of the query's tokens that appear in `name`. */
export function tokenOverlap(queryTokens: string[], name: string): number {
  if (queryTokens.length === 0) return 1;
  const nameTokens = new Set(contentTokens(name));
  let hits = 0;
  for (const t of queryTokens) {
    if (nameTokens.has(t) || [...nameTokens].some((n) => n.length >= 4 && (n.startsWith(t) || t.startsWith(n)))) hits++;
  }
  return hits / queryTokens.length;
}

/**
 * Reads the offer a product page publishes about itself: schema.org JSON-LD first,
 * then Open Graph product tags. Returns undefined when the page states no price, or
 * when the product it describes is not the one searched for (a category page listing
 * forty items says nothing about the price of this one).
 */
export function extractOfferFromHtml(html: string, queryTokens: string[]): PageOffer | undefined {
  const products: Json[] = [];
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    try {
      collectProducts(JSON.parse(m[1].trim()), products);
    } catch {
      // Malformed JSON-LD is common; skip the block.
    }
  }

  const offers = products
    .map(offerFromProduct)
    .filter((o) => o.price)
    .map((o) => ({ offer: o, overlap: tokenOverlap(queryTokens, o.name || '') }))
    .sort((a, b) => b.overlap - a.overlap);

  if (offers.length > 0) {
    const top = offers[0];
    const needed = offers.length > 1 ? 0.6 : 0.34;
    if (top.overlap >= needed) return top.offer;
  }

  const amount = metaContent(html, ['product:price:amount', 'og:price:amount', 'price']);
  const currency = metaContent(html, ['product:price:currency', 'og:price:currency', 'priceCurrency']);
  const title = metaContent(html, ['og:title']) || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const value = num(amount);
  if (value !== undefined && value > 0 && currency && tokenOverlap(queryTokens, htmlToText(title)) >= 0.34) {
    const amountUSD = toUSD(value, currency);
    if (amountUSD !== undefined) {
      const availability = readAvailability(metaContent(html, ['product:availability', 'og:availability']));
      return {
        name: htmlToText(title),
        price: {
          amount: value,
          currency: currency.toUpperCase(),
          amountUSD,
          raw: `${currency.toUpperCase()} ${value.toFixed(2)}`,
          index: 0
        },
        availability,
        source: 'meta'
      };
    }
  }
  return undefined;
}
