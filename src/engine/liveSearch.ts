import { CompanyProfile, ServiceCategory, VendorService } from './types';
import { scrapeLiveWebDeals } from './liveWebScraper';
import { searchLiveLocalStores } from './liveLocalSearcher';
import { searchLiveWebDeals, LiveWebDeal } from './liveWebDealFinder';
import { StoreReport } from './storeSources';
import { loadLiveRates } from './currency';
import { enrichShopifyDelivery, searchCommunityPrices, searchCommunityShops } from './communityPrices';
import { matchCuratedDeals } from './liveWebDealFinder';
import { Trip, parseTrip } from './tripParser';
import { FareCalendarDay, searchTravel } from './travelSearch';

export interface SourceReport {
  source: 'web' | 'local' | 'deals' | 'community' | 'shops' | 'travel';
  ok: boolean;
  count: number;
  ms: number;
  error?: string;
}

export interface LiveSearchResult {
  query: string;
  webVendors: VendorService[];
  localStores: VendorService[];
  /** Prices other Hunu users were quoted nearby and chose to share. */
  communityPrices: VendorService[];
  /** Shops other Hunu users pinned nearby that sell something matching the search. */
  communityShops: VendorService[];
  deals: LiveWebDeal[];
  /** One line per source: whether it answered, how much it returned, how long it took. */
  sources: SourceReport[];
  /** The stores that were asked, what each returned, and a link to its own results page. */
  stores: StoreReport[];
  /** Set when exact matches were too few and this shorter search supplied similar items. */
  broadenedTo?: string;
  /** Set when the search was read as a trip: the fares are in `webVendors`. */
  trip?: Trip;
  /** Cheapest flight fare seen per day around the trip's date. */
  fareCalendar?: FareCalendarDay[];
  fromCache: boolean;
}

/**
 * A trip search: fares instead of stores. Shared prices still apply ("I paid GH₵150
 * Accra–Kumasi VIP"), and airline student programmes are matched as deals.
 */
export async function runTravelSearch(trip: Trip, query: string, profile: CompanyProfile, signal?: AbortSignal): Promise<LiveSearchResult> {
  await loadLiveRates();
  const started = Date.now();
  const [travel, community] = await Promise.all([
    searchTravel(trip, profile.location, signal).catch((err) => ({ rows: [], calendar: [], flightIssue: String((err as Error)?.message || err) })),
    timed('community', (onIssue) => searchCommunityPrices(query, profile.location, { signal, onIssue, category: 'Student Flights & Travel' }))
  ]);
  const travelReport: SourceReport = { source: 'travel', ok: travel.rows.length > 0, count: travel.rows.length, ms: Date.now() - started };
  if (travel.flightIssue) travelReport.error = `flights: ${travel.flightIssue}`;
  // Airline programmes attach to the airlines' rows by name.
  const deals = matchCuratedDeals(`${query} flight student travel`).filter((d) => trip.mode !== 'bus');
  return {
    query,
    webVendors: travel.rows,
    localStores: [],
    communityPrices: community.rows,
    communityShops: [],
    deals,
    sources: [travelReport, community.report],
    stores: [],
    trip,
    fareCalendar: travel.calendar,
    fromCache: false
  };
}

const RESULT_TTL_MS = 10 * 60 * 1000;
const SESSION_KEY = 'hunu_live_search_cache';
const MAX_SESSION_ENTRIES = 12;

const memory = new Map<string, { at: number; result: LiveSearchResult }>();

function cacheKey(query: string, profile: CompanyProfile, category?: string): string {
  const { latitude, longitude, country } = profile.location;
  return [
    query.trim().toLowerCase().replace(/\s+/g, ' '),
    country,
    latitude.toFixed(1),
    longitude.toFixed(1),
    category || ''
  ].join('|');
}

type SessionCache = Record<string, { at: number; result: LiveSearchResult }>;

function sessionStore(): chrome.storage.StorageArea | undefined {
  try {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session ? chrome.storage.session : undefined;
  } catch {
    return undefined;
  }
}

/** The popup is destroyed every time it closes; the session store lets it reopen with results. */
async function readSession(key: string): Promise<LiveSearchResult | undefined> {
  const store = sessionStore();
  if (!store) return undefined;
  try {
    const data = (await store.get(SESSION_KEY))[SESSION_KEY] as SessionCache | undefined;
    const entry = data?.[key];
    if (entry && Date.now() - entry.at < RESULT_TTL_MS) {
      memory.set(key, entry);
      return entry.result;
    }
  } catch {
    // The cache is an optimisation; a failed read just means a fresh search.
  }
  return undefined;
}

async function writeSession(key: string, result: LiveSearchResult): Promise<void> {
  const store = sessionStore();
  if (!store) return;
  try {
    const data = ((await store.get(SESSION_KEY))[SESSION_KEY] as SessionCache | undefined) || {};
    data[key] = { at: Date.now(), result };
    const keys = Object.keys(data).sort((a, b) => data[b].at - data[a].at);
    for (const stale of keys.slice(MAX_SESSION_ENTRIES)) delete data[stale];
    await store.set({ [SESSION_KEY]: data });
  } catch {
    // Quota or serialisation failure: skip caching.
  }
}

async function timed<T extends unknown[]>(
  source: SourceReport['source'],
  run: (onIssue: (issue: string) => void) => Promise<T>
): Promise<{ rows: T; report: SourceReport }> {
  const started = Date.now();
  const issues = new Set<string>();
  try {
    const rows = await run((issue) => issues.add(issue));
    const report: SourceReport = { source, ok: true, count: rows.length, ms: Date.now() - started };
    if (issues.size > 0) {
      report.error = [...issues].join('; ');
      // A source that returned nothing and said why did not really succeed.
      if (rows.length === 0) report.ok = false;
    }
    return { rows, report };
  } catch (err) {
    return {
      rows: [] as unknown as T,
      report: { source, ok: false, count: 0, ms: Date.now() - started, error: String((err as Error)?.message || err) }
    };
  }
}

export interface LiveSearchOptions {
  signal?: AbortSignal;
  category?: ServiceCategory;
}

/**
 * Runs every live source for one query and returns them together.
 *
 * The sources run in parallel and fail independently: an online store that does
 * not answer still leaves the other stores, local shops, shared prices and pins, and curated deals. Results are cached per query and
 * location for ten minutes, in memory and in the browser session.
 */
export async function runLiveSearch(
  query: string,
  profile: CompanyProfile,
  options: LiveSearchOptions = {}
): Promise<LiveSearchResult> {
  const trimmed = query.trim();
  const empty: LiveSearchResult = {
    query: trimmed,
    webVendors: [],
    localStores: [],
    communityPrices: [],
    communityShops: [],
    deals: [],
    sources: [],
    stores: [],
    fromCache: false
  };
  if (trimmed.length < 2) return empty;

  const key = cacheKey(trimmed, profile, options.category);
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < RESULT_TTL_MS) return { ...hit.result, fromCache: true };
  const stored = await readSession(key);
  if (stored) return { ...stored, fromCache: true };

  const { signal } = options;
  const trip = parseTrip(trimmed, profile.location);
  if (trip) {
    const result = await runTravelSearch(trip, trimmed, profile, signal);
    if (!signal?.aborted && result.webVendors.length > 0) memory.set(key, { at: Date.now(), result });
    return result;
  }
  // Prices are converted as they are read, so the day's rates must be in first.
  await loadLiveRates();
  let stores: StoreReport[] = [];
  let broadenedTo: string | undefined;
  const [web, local, deals, community, shops] = await Promise.all([
    timed('web', (onIssue) => scrapeLiveWebDeals(trimmed, profile.location, { signal, onIssue, onStores: (s) => (stores = s), onBroadened: (q) => (broadenedTo = q) })),
    timed('local', (onIssue) =>
      searchLiveLocalStores(trimmed, profile.location, options.category, { signal, onIssue })
    ),
    timed('deals', (onIssue) => searchLiveWebDeals(trimmed, undefined, { signal, onIssue })),
    timed('community', (onIssue) =>
      searchCommunityPrices(trimmed, profile.location, { signal, onIssue, category: options.category })
    ),
    timed('shops', (onIssue) =>
      searchCommunityShops(trimmed, profile.location, { signal, onIssue, category: options.category })
    )
  ]);

  // Exact delivery from the Shopify stores' own checkouts. Capped, so a slow store never
  // holds the search up: rows it does not reach keep their published policy or range.
  await Promise.race([
    enrichShopifyDelivery(web.rows, profile.location, signal).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 7000))
  ]);

  const result: LiveSearchResult = {
    query: trimmed,
    webVendors: web.rows,
    localStores: local.rows,
    communityPrices: community.rows,
    communityShops: shops.rows,
    deals: deals.rows,
    sources: [web.report, local.report, deals.report, community.report, shops.report],
    stores,
    broadenedTo,
    fromCache: false
  };

  // A cancelled or completely empty search is not worth remembering.
  if (!signal?.aborted && (result.webVendors.length > 0 || result.localStores.length > 0)) {
    memory.set(key, { at: Date.now(), result });
    void writeSession(key, result);
  }
  return result;
}
