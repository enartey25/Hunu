import { VendorService, GeoLocation, SellerDelivery, ServiceCategory } from './types';
import { parseB2BSearchQuery, ParsedIntent } from './queryParser';
import { fetchText, mapWithConcurrency } from './net';
import { contentTokens, htmlToText } from './text';
import {
  extractOfferFromHtml,
  findDiscount,
  pickListingPrice,
  shippingFor,
  tokenOverlap,
  PageOffer,
  ParsedPrice
} from './priceParser';
import { countryTld } from './scoring';
import { searchStores, StoreListing, StoreReport } from './storeSources';
import { accessoryQuery, markAccessories } from './accessories';

export interface WebSearchHit {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  /** Position in the result page it came from, starting at 0. */
  rank: number;
}

export type PageKind = 'product' | 'listing' | 'article';

const BING_ENDPOINT = 'https://www.bing.com/search';

/** Called with a short description when a source fails or is throttled. */
export type IssueReporter = (issue: string) => void;

/** Sites that discuss products but do not sell them. */
const NON_COMMERCE = [
  'wikipedia.org', 'youtube.com', 'youtu.be', 'reddit.com', 'quora.com', 'facebook.com',
  'instagram.com', 'pinterest.com', 'twitter.com', 'x.com', 'tiktok.com', 'linkedin.com',
  'medium.com', 'stackoverflow.com', 'stackexchange.com', 'github.com', 'wikihow.com',
  'britannica.com', 'instructables.com', 'hackster.io', 'hackaday.com', 'docs.arduino.cc',
  'forum.arduino.cc', 'arxiv.org', 'researchgate.net', 'slideshare.net', 'scribd.com',
  'google.com', 'bing.com', 'yahoo.com', 'imdb.com', 'fandom.com'
];

/** Large marketplaces that refuse automated page reads. Listed, but not fetched. */
const NO_ENRICH = ['amazon.', 'ebay.', 'aliexpress.', 'walmart.', 'temu.', 'alibaba.', 'jumia.', 'etsy.'];

const ARTICLE_PATH = /\/(blog|blogs|news|article|articles|guide|guides|tutorial|tutorials|how-to|howto|wiki|forum|forums|learn|docs|doc|support|help|community|review|reviews|compare|answers|questions|thread|threads)(\/|$)/i;
const PRODUCT_PATH = /\/(product|products|p|dp|item|itm|shop|store|buy|catalog|catalogue|listing|sku|pd|prod)(\/|-|$)|[?&](sku|pid|product_id|item)=|\.html?$/i;
const ARTICLE_TITLE = /^(how to|what is|what are|why |guide to|introduction to|getting started|the \d+ best|\d+ best|best \d+|top \d+)\b|\b(tutorial|explained|review:|vs\.?)\b/i;

function isNonCommerce(domain: string): boolean {
  return NON_COMMERCE.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function classifyPage(hit: Pick<WebSearchHit, 'url' | 'title'>): PageKind {
  let path = '';
  try {
    const u = new URL(hit.url);
    path = u.pathname + u.search;
  } catch {
    return 'listing';
  }
  if (ARTICLE_PATH.test(path) || ARTICLE_TITLE.test(hit.title.trim())) return 'article';
  if (PRODUCT_PATH.test(path)) return 'product';
  return 'listing';
}

/** Bing wraps result links in a tracking redirect whose `u` parameter is "a1" + base64url(target). */
function resolveBingUrl(href: string): string | undefined {
  let url = htmlToText(href);
  try {
    const parsed = new URL(url, 'https://www.bing.com');
    if (parsed.hostname.endsWith('bing.com') && parsed.pathname.startsWith('/ck/')) {
      const u = parsed.searchParams.get('u') || '';
      if (!u.startsWith('a1')) return undefined;
      const b64 = u.slice(2).replace(/-/g, '+').replace(/_/g, '/');
      url = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    } else if (parsed.hostname.endsWith('bing.com')) {
      return undefined;
    } else {
      url = parsed.toString();
    }
    const final = new URL(url);
    if (final.protocol !== 'https:' && final.protocol !== 'http:') return undefined;
    return final.toString();
  } catch {
    return undefined;
  }
}

/** Parses a Bing results page. */
export function parseBingResultsHtml(html: string): WebSearchHit[] {
  const hits: WebSearchHit[] = [];
  for (const block of html.split(/<li class="b_algo"/).slice(1)) {
    const link = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const url = resolveBingUrl(link[1]);
    if (!url) continue;
    let domain = '';
    try {
      domain = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      continue;
    }
    const para =
      block.match(/<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i) ||
      block.match(/class="b_caption[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
    const title = htmlToText(link[2]);
    if (!title) continue;
    hits.push({ title, url, domain, snippet: htmlToText(para?.[1] || ''), rank: hits.length });
  }
  return hits;
}

/**
 * The searches to run for one user query. Each asks the same question a different way:
 * who sells it, who sells it in the buyer's country, and (when asked) who supplies it
 * in bulk or has it on offer.
 */
export function buildSearchQueries(parsed: ParsedIntent, location: GeoLocation): string[] {
  const core = parsed.coreQuery;
  const place = parsed.extractedLocation || location.country || '';
  const queries: string[] = [];
  const isService = parsed.intents.includes('service');

  if (parsed.intents.includes('supplier')) {
    queries.push(`${core} supplier wholesale distributor`);
    if (place) queries.push(`${core} supplier ${place}`);
  } else if (isService) {
    queries.push(`${core} pricing plans`);
    if (place) queries.push(`${core} provider ${place}`);
  } else {
    queries.push(`${core} buy price`);
    if (place) queries.push(`${core} price in ${place}`);
  }
  if (parsed.intents.includes('deal')) queries.push(`${core} deal discount`);

  // Two phrasings at most: search engines throttle bursts, and a throttled search returns nothing.
  return [...new Set(queries)].slice(0, 2);
}

/**
 * One open-web search, on Bing. Used only where no store can answer: services, and
 * products the stores do not carry.
 */
export async function searchWeb(
  query: string,
  signal?: AbortSignal,
  onIssue?: IssueReporter
): Promise<WebSearchHit[]> {
  const res = await fetchText(`${BING_ENDPOINT}?q=${encodeURIComponent(query)}&setlang=en`, {
    timeoutMs: 6500,
    signal,
    headers: { Accept: 'text/html' }
  });
  if (res.error === 'cancelled') return [];
  if (res.status !== 200) {
    onIssue?.(`Bing unavailable (${res.error || res.status})`);
    return [];
  }
  return parseBingResultsHtml(res.text);
}

interface Candidate extends WebSearchHit {
  kind: PageKind;
  /** Reciprocal-rank-fusion score across the searches that returned it. */
  fused: number;
  snippetPrice?: ParsedPrice;
  offer?: PageOffer;
}

/** Trims the site name that search titles carry at the end: "Arduino Uno R3 | SparkFun". */
function cleanTitle(title: string, domain: string): string {
  const site = domain.split('.')[0];
  const parts = title.split(/\s+[|–—]\s+|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  while (parts.length > 1) {
    const last = parts[parts.length - 1];
    const lastKey = last.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (last.split(/\s+/).length <= 3 || lastKey.includes(site) || site.includes(lastKey)) parts.pop();
    else break;
  }
  let clean = parts.join(' - ').replace(/^(buy|shop|order)\s+/i, '').replace(/\s+/g, ' ').trim();
  // Collapse stuffed titles ("in Ghana Ghana From Ghana From Ghana") and keep names readable.
  clean = clean.replace(/\b(\w+)(?:\s+(?:from\s+)?\1\b)+/gi, '$1');
  if (clean.length > 72) clean = clean.slice(0, 70).replace(/\s+\S*$/, '') + '…';
  return clean;
}

function toVendor(
  c: Candidate,
  index: number,
  category: ServiceCategory,
  parsed: ParsedIntent,
  userLocation: GeoLocation
): VendorService {
  const price = c.offer?.price || c.snippetPrice;
  const priceSource = c.offer?.price ? 'page' : c.snippetPrice ? 'snippet' : undefined;
  const tld = countryTld(userLocation.country);
  const domestic = !!tld && (c.domain.endsWith(`.${tld}`) || c.domain.includes(`.${tld}.`));

  const discount = findDiscount(`${c.title} ${c.snippet}`);
  const productName = c.offer?.name && tokenOverlap(parsed.tokens, c.offer.name) >= 0.5 ? c.offer.name : cleanTitle(c.title, c.domain);
  const ratingKnown = c.offer?.rating !== undefined && (c.offer.reviewsCount ?? 0) > 0;

  const priceLabel = price
    ? price.currency === 'USD'
      ? `$${price.amountUSD.toFixed(2)} ${priceSource === 'page' ? 'on the product page' : 'in the search listing'}`
      : `${price.raw}, about $${price.amountUSD.toFixed(2)}`
    : 'Price on site';

  const features: string[] = [`Sold on ${c.domain}`];
  if (priceSource === 'page') features.push('Price read from the product page');
  if (priceSource === 'snippet') features.push('Price read from the search listing');
  if (c.offer?.availability === 'in_stock') features.push('Listed as in stock');
  if (c.offer?.availability === 'out_of_stock') features.push('Listed as out of stock');
  if (c.offer?.availability === 'preorder') features.push('Pre-order or back-order');
  if (c.offer?.brand) features.push(`Brand: ${c.offer.brand}`);
  if (domestic) features.push(`Trades in ${userLocation.country}`);
  if (c.kind === 'listing') features.push('Search or category page, not a single product');

  return {
    id: `web-scraped-${c.domain.replace(/[^a-zA-Z0-9]/g, '-')}-${index}`,
    name: `${productName || c.domain} (${c.domain})`,
    category,
    serviceType: 'hybrid',
    targetAudience: ['student', 'business', 'supply_chain'],
    location: {
      city: 'Online',
      stateOrRegion: c.domain,
      country: domestic ? userLocation.country : 'International',
      latitude: 0,
      longitude: 0,
      serviceRadiusKm: 20000
    },
    pricing: {
      baseMonthlyCost: price ? price.amountUSD : 0,
      pricingModel: 'per_unit',
      currency: 'USD',
      startingTierLabel: priceLabel,
      contractTerm: 'per_item',
      studentDiscountNote: discount
        ? `${discount.upTo ? 'Up to ' : ''}${discount.percent}% off mentioned in the listing.`
        : undefined
    },
    targetIndustries: ['All'],
    targetHeadcount: ['1-10', '11-50'],
    complianceCertifications: [],
    rating: ratingKnown ? c.offer!.rating! : 0,
    reviewsCount: ratingKnown ? c.offer!.reviewsCount! : 0,
    slaGuarantee: `Order on ${c.domain}`,
    summary: c.snippet || `Listing for "${parsed.coreQuery}" on ${c.domain}.`,
    keyFeatures: features,
    hasOfficialWebsite: true,
    exactOrderUrl: c.url,
    websiteUrl: c.url,
    dataSource: 'web',
    priceKnown: !!price,
    priceSource,
    ratingKnown,
    locationKnown: false,
    availability: c.offer?.availability,
    delivery: pageDelivery(c, userLocation, domestic),
    seller: c.offer?.seller ? { name: c.offer.seller } : undefined
  };
}

/** The delivery charge the product page itself states for the buyer's country. */
function pageDelivery(c: Candidate, userLocation: GeoLocation, domestic: boolean): SellerDelivery | undefined {
  const rate = shippingFor(c.offer?.shipping, userLocation.country || '', domestic);
  if (!rate) return undefined;
  return {
    kind: rate.amount === 0 ? 'free' : 'exact',
    amount: rate.amount,
    currency: rate.currency,
    basis: `Stated on the product page at ${c.domain}`,
    transit: rate.transitDays ? `${rate.transitDays[0]} to ${rate.transitDays[1]} days` : undefined,
    sourceUrl: c.url,
    checkedAt: Date.now()
  };
}

/** A listing a store returned from its own search: the price and link are the store's own. */
function listingToVendor(
  l: StoreListing,
  index: number,
  category: ServiceCategory,
  userLocation: GeoLocation,
  /** Set when the listing was found with a shortened search, so it is a similar item rather than a match. */
  similarTo?: string
): VendorService {
  const domestic = !!l.country && l.country.toLowerCase() === (userLocation.country || '').toLowerCase();
  const rated = l.rating !== undefined && (l.reviewsCount ?? 0) > 0;
  const priceLabel = l.price
    ? l.price.currency === 'USD'
      ? `$${l.price.amountUSD.toFixed(2)} on ${l.store}`
      : `${l.price.raw} on ${l.store}, about $${l.price.amountUSD.toFixed(2)}`
    : 'Price on site';

  const features: string[] = [`Sold on ${l.store}`];
  if (l.price) features.push(`Price read from ${l.store}'s own listing`);
  if (l.place) features.push(`Seller in ${l.place}`);
  if (l.condition) features.push(`Condition: ${l.condition}`);
  if (l.availability === 'in_stock') features.push('Listed as in stock');
  if (l.availability === 'out_of_stock') features.push('Listed as out of stock');
  if (l.brand) features.push(`Brand: ${l.brand}`);
  if (l.discountPercent && l.listPrice && l.price) {
    features.push(`Was ${l.listPrice.raw}, now ${l.price.raw} (${l.discountPercent}% off)`);
  }
  if (domestic) features.push(`Trades in ${userLocation.country}`);
  else features.push(`Check that it ships to ${userLocation.country || 'you'}`);

  const title = l.title.length > 72 ? l.title.slice(0, 70).replace(/\s+\S*$/, '') + '…' : l.title;

  return {
    id: `web-scraped-${l.domain.replace(/[^a-zA-Z0-9]/g, '-')}-${index}`,
    name: `${title} (${l.store})`,
    category,
    serviceType: 'hybrid',
    targetAudience: ['student', 'business', 'supply_chain'],
    location: {
      city: l.place || 'Online',
      stateOrRegion: l.domain,
      country: domestic ? userLocation.country : 'International',
      latitude: 0,
      longitude: 0,
      serviceRadiusKm: 20000
    },
    pricing: {
      baseMonthlyCost: l.price ? l.price.amountUSD : 0,
      pricingModel: 'per_unit',
      currency: 'USD',
      startingTierLabel: priceLabel,
      contractTerm: 'per_item'
    },
    targetIndustries: ['All'],
    targetHeadcount: ['1-10', '11-50'],
    complianceCertifications: [],
    rating: rated ? l.rating! : 0,
    reviewsCount: rated ? l.reviewsCount! : 0,
    slaGuarantee: `Order on ${l.store}`,
    summary: l.snippet || `${l.title}, listed on ${l.store}.`,
    keyFeatures: features,
    hasOfficialWebsite: true,
    exactOrderUrl: l.url,
    websiteUrl: l.url,
    dataSource: 'web',
    priceKnown: !!l.price,
    priceSource: l.price ? 'page' : undefined,
    ratingKnown: rated,
    locationKnown: false,
    availability: l.availability,
    listPriceUSD: l.discountPercent ? l.listPrice?.amountUSD : undefined,
    discountPercent: l.discountPercent,
    seller: l.seller,
    delivery: l.delivery,
    // A similar item would otherwise be dropped for not matching every word of a long search.
    ...(similarTo ? { relevanceHint: 0.5, matchBasis: `Similar item, found by searching “${similarTo}”` } : {})
  };
}

/** Listings kept per store, so one large marketplace cannot fill the list. */
const PER_STORE = 3;
/** Below this many store listings, the open web is searched as well. */
const ENOUGH_STORE_LISTINGS = 4;

/**
 * The listings that are about the product searched for, best match first within each
 * store. Accessories ("iPhone 15 Case" for "iphone 15") come after every listing of the
 * product itself, so they cannot take a store's few places; they are marked `accessory`.
 */
export function pickStoreListings(listings: StoreListing[], queryTokens: string[], maxResults: number): StoreListing[] {
  const matching = listings
    .map((l) => ({ l, overlap: tokenOverlap(queryTokens, l.title) }))
    .filter((x) => x.overlap >= 0.5);
  const addOn = markAccessories(
    matching.map((x) => ({ title: x.l.title, priceUSD: x.l.price?.amountUSD })),
    accessoryQuery(queryTokens)
  );
  const scored = matching
    .map((x, i) => ({ ...x, l: addOn[i] ? { ...x.l, accessory: true } : x.l, addOn: addOn[i] }))
    .sort((a, b) => Number(a.addOn) - Number(b.addOn) || b.overlap - a.overlap || a.l.rank - b.l.rank);

  const perStore = new Map<string, number>();
  const seen = new Set<string>();
  const picked: StoreListing[] = [];
  for (const { l } of scored) {
    const n = perStore.get(l.store) || 0;
    // Classifieds repeat the same advert, and Jiji and Tonaton share adverts: one row
    // per title and price is enough. Shops are only deduplicated against themselves.
    const key = `${l.place ? 'classified' : l.store}|${l.title.toLowerCase()}|${l.price?.amount ?? ''}`;
    if (n >= PER_STORE || seen.has(key)) continue;
    seen.add(key);
    perStore.set(l.store, n + 1);
    picked.push(l);
  }
  return picked.slice(0, maxResults);
}

/** Words that describe the listing rather than the product. */
const LISTING_NOISE = new Set([
  'new', 'brand', 'original', 'genuine', 'official', 'authentic', 'sealed', 'latest', 'portable', 'quality',
  'free', 'delivery', 'shipping', 'black', 'white', 'blue', 'red', 'gold', 'silver', 'grey', 'gray', 'green',
  'pink', 'purple', 'with', 'inch', 'model', 'edition', 'version', 'unlocked', 'warranty'
]);

/**
 * Shorter searches to fall back on when a long one (typically a product page's title)
 * finds too little: first its leading words, where the brand and model usually sit,
 * then just its plain product words.
 */
export function broaderQueries(tokens: string[]): string[] {
  if (tokens.length < 4) return [];
  const useful = tokens.filter((t) => !LISTING_NOISE.has(t));
  const leading = useful.slice(0, 3).join(' ');
  const plain = useful.filter((t) => /^[a-z]{4,}$/.test(t)).slice(0, 2).join(' ');
  return [...new Set([leading, plain])].filter((q) => q && q.split(' ').length < tokens.length);
}

export interface ScrapeOptions {
  signal?: AbortSignal;
  /** Told when too few exact matches were found and a shorter search was used instead. */
  onBroadened?: (query: string) => void;
  /** Told which stores were asked and what each returned, with a link to its results page. */
  onStores?: (stores: StoreReport[]) => void;
  /** Told about throttling and failures, so the caller can say why results are thin. */
  onIssue?: IssueReporter;
  /** Read the top results' own pages for price, stock and rating. Default true. */
  enrich?: boolean;
  maxResults?: number;
}

/**
 * Finds live offers for a query.
 *
 * 1. Asks the stores themselves (storeSources.ts). Each answers from its own search
 *    with its own price and link, so nothing is guessed from a search snippet.
 * 2. Only when the stores cannot answer (a service, or a product none of them lists)
 *    is the open web searched, and the best pages read for the offer they publish.
 *
 * Nothing is filled in when it cannot be read: a listing without a price is returned
 * as "price unknown", and one without a rating as unrated.
 */
export async function scrapeLiveWebDeals(
  query: string,
  userLocation: GeoLocation,
  options: ScrapeOptions = {}
): Promise<VendorService[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const parsed = parseB2BSearchQuery(trimmed);
  if (parsed.tokens.length === 0) return [];
  const category: ServiceCategory =
    parsed.category && parsed.categoryConfidence >= 0.6 ? parsed.category : 'General Products & Retail';
  const maxResults = options.maxResults ?? 18;

  try {
    let fromStores: StoreListing[] = [];
    let similar: StoreListing[] = [];
    let similarTo: string | undefined;
    // Stores sell products; a search for a service goes straight to the open web.
    if (!parsed.intents.includes('service')) {
      const { listings, stores } = await searchStores(parsed, userLocation, options.signal);
      options.onStores?.(stores);
      fromStores = pickStoreListings(listings, parsed.tokens, maxResults);
      const failed = stores.filter((s) => !s.ok);
      if (stores.length > 0 && failed.length === stores.length) {
        options.onIssue?.('None of the stores answered');
      }
    }
    // Accessories do not count toward having found enough of the product itself.
    const products = (ls: StoreListing[]) => ls.filter((l) => !l.accessory).length;
    // A long search that matched little: try it shorter, and show what that finds as similar items.
    if (!parsed.intents.includes('service') && products(fromStores) < ENOUGH_STORE_LISTINGS) {
      const have = new Set(fromStores.map((l) => l.url));
      for (const shorter of broaderQueries(parsed.tokens)) {
        if (options.signal?.aborted) break;
        const { listings, stores } = await searchStores(parsed, userLocation, options.signal, shorter);
        const found = pickStoreListings(listings, contentTokens(shorter), maxResults).filter((l) => !have.has(l.url));
        if (products(found) > products(similar)) {
          similar = found;
          similarTo = shorter;
          options.onStores?.(stores);
        }
        if (products(fromStores) + products(similar) >= ENOUGH_STORE_LISTINGS) break;
      }
      if (similarTo && similar.length > 0) options.onBroadened?.(similarTo);
      similar = similar.slice(0, maxResults - fromStores.length);
    }

    const vendors = [
      ...fromStores.map((l, i) => listingToVendor(l, i, category, userLocation)),
      ...similar.map((l, i) => listingToVendor(l, fromStores.length + i, category, userLocation, similarTo))
    ];
    if (products(fromStores) + products(similar) >= ENOUGH_STORE_LISTINGS || options.signal?.aborted) return vendors;

    const known = new Set([...fromStores, ...similar].map((l) => l.domain));
    const web = await searchOpenWeb(parsed, userLocation, category, options, maxResults - products(fromStores) - products(similar));
    return [...vendors, ...web.filter((v) => !known.has(v.location.stateOrRegion))];
  } catch (err) {
    console.warn('[Hunu] Live search failed:', err);
    options.onIssue?.(`Live search failed: ${String((err as Error)?.message || err)}`);
    return [];
  }
}

/**
 * The open-web fallback: up to two differently phrased searches fused by reciprocal
 * rank, pages that only discuss the product dropped, and the best candidates' own
 * pages read for the price, stock and rating they publish.
 */
async function searchOpenWeb(
  parsed: ParsedIntent,
  userLocation: GeoLocation,
  category: ServiceCategory,
  options: ScrapeOptions,
  maxResults: number
): Promise<VendorService[]> {
  {
    const queries = buildSearchQueries(parsed, userLocation);
    const pages = await Promise.all(queries.map((q) => searchWeb(q, options.signal, options.onIssue)));
    if (pages.every((hits) => hits.length === 0)) {
      options.onIssue?.('The web search returned no results');
    }

    // Reciprocal rank fusion: a page found by several phrasings rises to the top.
    const byUrl = new Map<string, Candidate>();
    pages.forEach((hits) => {
      for (const hit of hits) {
        if (isNonCommerce(hit.domain)) continue;
        const key = hit.url.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
        const gain = 1 / (10 + hit.rank);
        const existing = byUrl.get(key);
        if (existing) {
          existing.fused += gain;
          if (hit.snippet.length > existing.snippet.length) existing.snippet = hit.snippet;
        } else {
          byUrl.set(key, { ...hit, kind: classifyPage(hit), fused: gain });
        }
      }
    });

    let candidates = [...byUrl.values()];
    for (const c of candidates) {
      c.snippetPrice = pickListingPrice(`${c.title} ${c.snippet}`, c.domain);
    }

    // Articles are kept only when they quote a price; the title must be about the product.
    candidates = candidates.filter((c) => {
      if (c.kind === 'article' && !c.snippetPrice) return false;
      return tokenOverlap(parsed.tokens, `${c.title} ${c.snippet}`) >= 0.5;
    });

    // Product pages before listings before articles, then by fused rank.
    const kindOrder: Record<PageKind, number> = { product: 0, listing: 1, article: 2 };
    candidates.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || b.fused - a.fused);

    // At most two rows per shop, so one site cannot fill the list.
    const perDomain = new Map<string, number>();
    const picked: Candidate[] = [];
    if (maxResults <= 0) return [];
    for (const c of candidates) {
      const n = perDomain.get(c.domain) || 0;
      if (n >= 2) continue;
      perDomain.set(c.domain, n + 1);
      picked.push(c);
      if (picked.length >= maxResults) break;
    }

    if (options.enrich !== false) {
      const toEnrich = picked
        .filter((c) => c.kind !== 'article' && !NO_ENRICH.some((d) => c.domain.includes(d)))
        .slice(0, 6);
      await mapWithConcurrency(toEnrich, 4, async (c) => {
        const page = await fetchText(c.url, {
          timeoutMs: 5000,
          signal: options.signal,
          maxChars: 1_500_000,
          headers: { Accept: 'text/html' }
        });
        if (page.ok && page.text) {
          c.offer = extractOfferFromHtml(page.text, parsed.tokens);
        }
      });
    }

    return picked.map((c, i) => toVendor(c, i, category, parsed, userLocation));
  }
}
