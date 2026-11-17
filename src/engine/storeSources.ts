/**
 * Direct store sources.
 *
 * Instead of asking a search engine who sells something and then guessing a price
 * from a snippet, each store here is asked through its own search and answers with
 * its own listings: title, price, link, and where published, stock and rating.
 *
 * Every endpoint below was checked from a Ghanaian connection and answers a plain
 * request without a key or a login. Stores that refuse automated requests (eBay,
 * DigiKey, Mouser, Newegg, LCSC, Melcom, Walmart) are deliberately absent.
 */
import { GeoLocation, SellerDelivery, SellerInfo } from './types';
import { ParsedIntent } from './queryParser';
import { fetchText, mapWithConcurrency } from './net';
import { htmlToText } from './text';
import { toUSD } from './currency';
import { parsePrices, ParsedPrice } from './priceParser';

export interface StoreListing {
  title: string;
  url: string;
  domain: string;
  /** The store's display name: "Jumia Ghana". */
  store: string;
  /** Country the store trades in, when it is a national store. */
  country?: string;
  price?: ParsedPrice;
  availability?: 'in_stock' | 'out_of_stock';
  rating?: number;
  reviewsCount?: number;
  brand?: string;
  /** Where the seller is, for classifieds: "Greater Accra, Oyarifa". */
  place?: string;
  condition?: string;
  /** The price the store says it charged before: the struck-through or "was" price. */
  listPrice?: ParsedPrice;
  /** Markdown against that previous price, in percent. */
  discountPercent?: number;
  /** What the store publishes about the seller of this listing. */
  seller?: SellerInfo;
  /** A delivery charge the store states for this listing. */
  delivery?: SellerDelivery;
  snippet: string;
  /** Position in the store's own results, starting at 0. */
  rank: number;
  /** Set when picked: a case, charger or other add-on to the product searched for. */
  accessory?: boolean;
}

type Json = Record<string, any>;

function makePrice(amount: unknown, currency: string): ParsedPrice | undefined {
  const value = typeof amount === 'number' ? amount : parseFloat(String(amount ?? '').replace(/,/g, ''));
  const code = currency.toUpperCase();
  const amountUSD = toUSD(value, code);
  if (!(value > 0) || amountUSD === undefined) return undefined;
  return {
    amount: value,
    currency: code,
    amountUSD,
    raw: `${code} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    index: 0
  };
}

/**
 * The discount a store states: its previous price and the markdown against it. Empty
 * when the store gives no previous price, or one that is not above the current price.
 */
function markdown(price: ParsedPrice | undefined, listPrice: ParsedPrice | undefined): Pick<StoreListing, 'listPrice' | 'discountPercent'> {
  if (!price || !listPrice || listPrice.currency !== price.currency || !(listPrice.amount > price.amount)) return {};
  const percent = Math.round((1 - price.amount / listPrice.amount) * 100);
  return percent >= 1 && percent < 100 ? { listPrice, discountPercent: percent } : {};
}

/** Cuts the JSON array that follows `marker` out of a page, by matching brackets. */
function sliceJsonArray(text: string, marker: string): string | undefined {
  const at = text.indexOf(marker);
  if (at < 0) return undefined;
  const start = at + marker.length - 1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}

function parseJson(text: string | undefined): any {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function hostOf(origin: string): string {
  return origin.replace(/^https?:\/\//, '').replace(/^www\./, '');
}

// --- Parsers. Each takes the raw response and is pure, so it is tested offline. ---------

/**
 * What Jiji shows about an advertiser, from the labels on the ad itself:
 * `{type:"rating",value:4.9}`, `{type:"id_verify"}`, `{type:"age",value:"3+ years on Jiji"}`,
 * and whether the ad's position was paid for (`is_boost`).
 */
export function jijiSeller(ad: Json): SellerInfo | undefined {
  const labels: Json[] = Array.isArray(ad?.labels) ? ad.labels : [];
  const seller: SellerInfo = {};
  for (const label of labels) {
    if (label?.type === 'rating') {
      const value = Number(label.value);
      if (value > 0 && value <= 5) seller.rating = value;
    } else if (label?.type === 'id_verify') {
      seller.verifiedId = true;
    } else if (label?.type === 'age') {
      const years = parseInt(String(label.value).match(/(\d+)\+?\s*years?/i)?.[1] || '', 10);
      if (years >= 0) seller.yearsActive = years;
      else if (/month|week|day/i.test(String(label.value))) seller.yearsActive = 0;
    }
  }
  if (ad?.is_boost || ad?.is_top) seller.paidPlacement = true;
  if (ad?.user_id !== undefined && ad?.user_id !== null) seller.platformId = String(ad.user_id);
  return Object.keys(seller).length > 0 ? seller : undefined;
}

/** Jiji classifieds: JSON API. */
export function parseJiji(text: string, origin: string, store: string, country: string, currency: string): StoreListing[] {
  const adverts: Json[] = parseJson(text)?.adverts_list?.adverts || [];
  const out: StoreListing[] = [];
  for (const ad of adverts) {
    if (!ad?.title || ad.is_job || ad.is_cv) continue;
    // Jiji gives the advert's path; Tonaton gives only the parts its links are built from.
    const path = ad.url
      ? String(ad.url).replace(/\?.*$/, '')
      : ad.slug && ad.guid
      ? `/a_${ad.slug}-${ad.guid}.html`
      : '';
    if (!path) continue;
    const condition = (ad.attrs as Json[] | undefined)?.find((a) => a?.name === 'Condition')?.value;
    out.push({
      title: String(ad.title),
      url: origin + path,
      domain: hostOf(origin),
      store,
      country,
      price: makePrice(ad.price_obj?.value, currency),
      place: ad.region_item_text || ad.region_name,
      condition: typeof condition === 'string' ? condition : undefined,
      seller: jijiSeller(ad),
      snippet: String(ad.short_description || ad.details || '').slice(0, 220),
      rank: out.length
    });
  }
  return out;
}

/** Jumia: the catalogue page carries its product list as JSON. */
export function parseJumia(html: string, origin: string, store: string, country: string, currency: string): StoreListing[] {
  const products: Json[] = parseJson(sliceJsonArray(html, '"products":[')) || [];
  const out: StoreListing[] = [];
  for (const p of products) {
    const title = p?.displayName || p?.name;
    if (!title || !p.url) continue;
    const price = makePrice(p.prices?.rawPrice, currency);
    // "GH₵ 3 625": the old price is only given formatted.
    const oldPrice = makePrice(String(p.prices?.oldPrice || '').replace(/[^\d.]/g, ''), currency);
    const ratings = Number(p.rating?.totalRatings) || 0;
    out.push({
      title: String(title),
      url: origin + String(p.url),
      domain: hostOf(origin),
      store,
      country,
      price,
      ...markdown(price, oldPrice),
      availability: p.isBuyable === false ? 'out_of_stock' : p.isBuyable === true ? 'in_stock' : undefined,
      rating: ratings > 0 ? Number(p.rating.average) : undefined,
      reviewsCount: ratings > 0 ? ratings : undefined,
      brand: typeof p.brand === 'string' ? p.brand : undefined,
      snippet: Array.isArray(p.categories) ? p.categories.slice(-2).join(', ') : '',
      rank: out.length
    });
  }
  return out;
}

/** Any Shopify storefront: the predictive search endpoint. It does not state a currency, so the store's is given. */
export function parseShopifySuggest(text: string, origin: string, store: string, currency: string, country?: string): StoreListing[] {
  const products: Json[] = parseJson(text)?.resources?.results?.products || [];
  const out: StoreListing[] = [];
  for (const p of products) {
    if (!p?.title || !p.url) continue;
    const price = makePrice(p.price_min ?? p.price, currency);
    out.push({
      title: String(p.title),
      url: origin + String(p.url).replace(/\?.*$/, ''),
      domain: hostOf(origin),
      store,
      country,
      price,
      ...markdown(price, makePrice(p.compare_at_price_min, currency)),
      availability: p.available === true ? 'in_stock' : p.available === false ? 'out_of_stock' : undefined,
      brand: typeof p.vendor === 'string' && p.vendor ? p.vendor : undefined,
      snippet: htmlToText(String(p.body || '')).slice(0, 220),
      rank: out.length
    });
  }
  return out;
}

/** AliExpress: the search page carries its item list as JSON, priced in the visitor's currency. */
export function parseAliExpress(html: string): StoreListing[] {
  const items: Json[] = parseJson(sliceJsonArray(html, '"itemList":{"content":[')) || [];
  const out: StoreListing[] = [];
  for (const item of items) {
    const title = item?.title?.displayTitle;
    const id = item?.productId;
    if (!title || !id) continue;
    const sale = item.prices?.salePrice;
    const sold = item.trade?.tradeDesc;
    const price = sale?.currencyCode ? makePrice(sale.minPrice, String(sale.currencyCode)) : undefined;
    const original = item.prices?.originalPrice;
    out.push({
      title: String(title),
      url: `https://www.aliexpress.com/item/${id}.html`,
      domain: 'aliexpress.com',
      store: 'AliExpress',
      price,
      ...markdown(price, original?.currencyCode ? makePrice(original.minPrice, String(original.currencyCode)) : undefined),
      snippet: typeof sold === 'string' ? sold : '',
      rank: out.length
    });
  }
  return out;
}

/** Amazon: search result cards. Sponsored cards are dropped. */
export function parseAmazon(html: string, origin: string): StoreListing[] {
  const out: StoreListing[] = [];
  const cardRe = /data-asin="([A-Z0-9]{10})"[^>]*data-component-type="s-search-result"/g;
  const cards: { asin: string; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = cardRe.exec(html)) !== null) cards.push({ asin: m[1], start: m.index });

  cards.forEach((card, i) => {
    const block = html.slice(card.start, i + 1 < cards.length ? cards[i + 1].start : card.start + 60000);
    const title = htmlToText(
      block.match(/<h2[^>]*aria-label="([^"]+)"/)?.[1] || block.match(/<h2[^>]*>\s*<span[^>]*>([^<]+)/)?.[1] || ''
    );
    if (!title || /^Sponsored Ad\b/i.test(title)) return;
    const priceText = htmlToText(block.match(/class="a-offscreen">([^<]+)/)?.[1] || '');
    // The struck-through list price sits in its own "a-text-price" span.
    const listText = htmlToText(block.match(/class="a-price a-text-price"[^>]*>\s*<span class="a-offscreen">([^<]+)/)?.[1] || '');
    const price = priceText ? parsePrices(priceText, hostOf(origin))[0] : undefined;
    const rating = parseFloat(block.match(/aria-label="([\d.]+) out of 5 stars/)?.[1] || '');
    const reviews = parseInt((block.match(/aria-label="([\d,]+) ratings?"/)?.[1] || '').replace(/,/g, ''), 10);
    const rated = rating > 0 && reviews > 0;
    out.push({
      title,
      url: `${origin}/dp/${card.asin}`,
      domain: hostOf(origin),
      store: 'Amazon',
      price,
      ...markdown(price, listText ? parsePrices(listText, hostOf(origin))[0] : undefined),
      rating: rated ? rating : undefined,
      reviewsCount: rated ? reviews : undefined,
      snippet: '',
      rank: out.length
    });
  });
  return out;
}

/** Adafruit: search rows marked up with schema.org microdata. */
export function parseAdafruit(html: string): StoreListing[] {
  const out: StoreListing[] = [];
  for (const block of html.split(/(?=<a href="\/product\/\d+" data-pid=")/).slice(1)) {
    const title = htmlToText(block.match(/data-name="([^"]+)"/)?.[1] || '');
    const id = block.match(/data-pid="(\d+)"/)?.[1];
    if (!title || !id) continue;
    const currency = block.match(/itemprop="priceCurrency" content="([A-Z]{3})"/)?.[1] || 'USD';
    const availability = block.match(/itemprop="availability" content="([^"]+)"/)?.[1] || '';
    out.push({
      title,
      url: `https://www.adafruit.com/product/${id}`,
      domain: 'adafruit.com',
      store: 'Adafruit',
      price: makePrice(block.match(/itemprop="price" content="([\d.]+)"/)?.[1], currency),
      availability: /InStock/i.test(availability) ? 'in_stock' : /OutOfStock/i.test(availability) ? 'out_of_stock' : undefined,
      brand: 'Adafruit',
      snippet: '',
      rank: out.length
    });
  }
  return out;
}

// --- The stores ---------------------------------------------------------------------------

export interface StoreSource {
  id: string;
  name: string;
  /** Link to the store's own results page for a query, shown when the store is listed as a source. */
  searchPage: (query: string) => string;
  /** The request that returns listings. */
  endpoint: (query: string) => string;
  parse: (text: string) => StoreListing[];
  /** Set for a national store: it is only asked when the buyer is in that country. */
  country?: string;
  /** Maker stores are only asked about electronics and lab parts. */
  makerOnly?: boolean;
  /** Large pages need a longer deadline. */
  slow?: boolean;
}

const enc = encodeURIComponent;

function shopify(id: string, name: string, origin: string, currency: string, extra: Partial<StoreSource> = {}): StoreSource {
  return {
    id,
    name,
    searchPage: (q) => `${origin}/search?q=${enc(q)}`,
    endpoint: (q) => `${origin}/search/suggest.json?q=${enc(q)}&resources[type]=product&resources[limit]=8`,
    parse: (text) => parseShopifySuggest(text, origin, name, currency, extra.country),
    ...extra
  };
}

function jumia(id: string, name: string, origin: string, country: string, currency: string): StoreSource {
  return {
    id,
    name,
    country,
    slow: true,
    searchPage: (q) => `${origin}/catalog/?q=${enc(q)}`,
    endpoint: (q) => `${origin}/catalog/?q=${enc(q)}`,
    parse: (text) => parseJumia(text, origin, name, country, currency)
  };
}

export const STORE_SOURCES: StoreSource[] = [
  // Ghana
  {
    id: 'jiji-gh',
    name: 'Jiji Ghana',
    country: 'Ghana',
    searchPage: (q) => `https://jiji.com.gh/search?query=${enc(q)}`,
    endpoint: (q) => `https://jiji.com.gh/api_web/v1/listing?query=${enc(q)}&page=1`,
    parse: (text) => parseJiji(text, 'https://jiji.com.gh', 'Jiji Ghana', 'Ghana', 'GHS')
  },
  {
    id: 'tonaton',
    name: 'Tonaton',
    country: 'Ghana',
    searchPage: (q) => `https://tonaton.com/search?query=${enc(q)}`,
    endpoint: (q) => `https://tonaton.com/api_web/v1/listing?query=${enc(q)}&page=1`,
    parse: (text) => parseJiji(text, 'https://tonaton.com', 'Tonaton', 'Ghana', 'GHS')
  },
  jumia('jumia-gh', 'Jumia Ghana', 'https://www.jumia.com.gh', 'Ghana', 'GHS'),
  shopify('compughana', 'CompuGhana', 'https://compughana.com', 'GHS', { country: 'Ghana' }),
  shopify('telefonika', 'Telefonika', 'https://telefonika.com', 'GHS', { country: 'Ghana' }),
  shopify('starlite', 'Starlite', 'https://starlite.com.gh', 'GHS', { country: 'Ghana' }),
  // Other Jumia countries
  jumia('jumia-ng', 'Jumia Nigeria', 'https://www.jumia.com.ng', 'Nigeria', 'NGN'),
  jumia('jumia-ke', 'Jumia Kenya', 'https://www.jumia.co.ke', 'Kenya', 'KES'),
  // International marketplaces. Both price in the visitor's own currency.
  {
    id: 'aliexpress',
    name: 'AliExpress',
    slow: true,
    searchPage: (q) => `https://www.aliexpress.com/w/wholesale-${enc(q.trim().replace(/\s+/g, '-'))}.html`,
    endpoint: (q) => `https://www.aliexpress.com/w/wholesale-${enc(q.trim().replace(/\s+/g, '-'))}.html`,
    parse: parseAliExpress
  },
  {
    id: 'amazon',
    name: 'Amazon',
    slow: true,
    searchPage: (q) => `https://www.amazon.com/s?k=${enc(q)}`,
    endpoint: (q) => `https://www.amazon.com/s?k=${enc(q)}`,
    parse: (text) => parseAmazon(text, 'https://www.amazon.com')
  },
  // Maker and lab-component stores
  shopify('arduino', 'Arduino Store', 'https://store-usa.arduino.cc', 'USD', { makerOnly: true }),
  shopify('pimoroni', 'Pimoroni', 'https://shop.pimoroni.com', 'GBP', { makerOnly: true }),
  shopify('pihut', 'The Pi Hut', 'https://thepihut.com', 'GBP', { makerOnly: true }),
  {
    id: 'adafruit',
    name: 'Adafruit',
    makerOnly: true,
    searchPage: (q) => `https://www.adafruit.com/search?q=${enc(q)}`,
    endpoint: (q) => `https://www.adafruit.com/search?q=${enc(q)}`,
    parse: parseAdafruit
  }
];

const MAKER_WORDS = /\b(arduino|raspberry|esp32|esp8266|stm32|sensors?|servo|breadboard|resistors?|capacitors?|transistors?|microcontroller|pcb|leds?|relay|shield|stepper|jumper|solder(?:ing)?|multimeter|oscilloscope|lora|pico|teensy|breakout|diodes?|mosfet|potentiometer|oled|lcd|motor driver|dev(?:elopment)? board|gpio|rfid|ultrasonic)\b/i;

/**
 * When the location lookup gave coordinates but no country name (it happens when the
 * IP lookup fails), the national stores would all be skipped. Ghana is recognised
 * from its bounding box.
 */
function countryFromCoordinates(location: GeoLocation): string {
  const { latitude, longitude } = location;
  if (latitude >= 4.5 && latitude <= 11.3 && longitude >= -3.4 && longitude <= 1.3) return 'ghana';
  return '';
}

/** The stores worth asking for this query from this country. */
export function storesFor(parsed: ParsedIntent, location: GeoLocation): StoreSource[] {
  const country = (location.country || '').trim().toLowerCase() || countryFromCoordinates(location);
  const maker = parsed.category === 'Lab Components & Hardware' || MAKER_WORDS.test(parsed.coreQuery);
  return STORE_SOURCES.filter((s) => {
    if (s.country && s.country.toLowerCase() !== country) return false;
    if (s.makerOnly && !maker) return false;
    return true;
  });
}

export interface StoreReport {
  id: string;
  name: string;
  /** The store's own results page for this query. */
  searchUrl: string;
  ok: boolean;
  count: number;
  error?: string;
}

export interface StoreSearchResult {
  listings: StoreListing[];
  stores: StoreReport[];
}

/** Asks every relevant store at once. A store that fails or is slow costs only its own rows. */
export async function searchStores(
  parsed: ParsedIntent,
  location: GeoLocation,
  signal?: AbortSignal,
  /** The words to search for, when not the buyer's own: a shortened form of a long query. */
  queryOverride?: string
): Promise<StoreSearchResult> {
  const query = queryOverride || parsed.coreQuery;
  const sources = storesFor(parsed, location);
  const listings: StoreListing[] = [];
  const stores = await mapWithConcurrency(sources, 8, async (source): Promise<StoreReport> => {
    const report: StoreReport = { id: source.id, name: source.name, searchUrl: source.searchPage(query), ok: false, count: 0 };
    const res = await fetchText(source.endpoint(query), {
      timeoutMs: source.slow ? 9000 : 6500,
      signal,
      maxChars: 2_500_000,
      // Result pages run to a megabyte; the finished search is cached instead.
      cacheTtlMs: source.slow ? 0 : undefined,
      headers: { Accept: 'application/json, text/html;q=0.9, */*;q=0.8' }
    });
    if (res.status !== 200) {
      report.error = res.error || `HTTP ${res.status}`;
      return report;
    }
    try {
      const found = source.parse(res.text);
      report.ok = true;
      report.count = found.length;
      listings.push(...found);
    } catch (err) {
      report.error = `unreadable response (${String((err as Error)?.message || err)})`;
    }
    return report;
  });
  return { listings, stores };
}
