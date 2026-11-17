/**
 * The website's search. A web page cannot ask the stores itself (they do not allow it
 * from other sites), so the stores are asked by Hunu's API, which runs the same engine as
 * the extension. Shared prices, shared shops and checkout delivery charges come from
 * Hunu's own API, which the page can call directly.
 */
import { CompanyProfile } from './types';
import type { LiveSearchOptions, LiveSearchResult, SourceReport } from './liveSearch';
import { runTravelSearch } from './liveSearch';
import { parseTrip } from './tripParser';
import { HUNU_API_URL, communityEnabled, enrichShopifyDelivery, searchCommunityPrices, searchCommunityShops } from './communityPrices';
import { fetchText } from './net';
import { loadLiveRates } from './currency';

export async function remoteSearch(query: string, profile: CompanyProfile, options: LiveSearchOptions = {}): Promise<LiveSearchResult> {
  const trimmed = query.trim();
  const empty: LiveSearchResult = { query: trimmed, webVendors: [], localStores: [], communityPrices: [], communityShops: [], deals: [], sources: [], stores: [], fromCache: false };
  if (trimmed.length < 2 || !communityEnabled()) return empty;
  const { signal, category } = options;
  const loc = profile.location;
  await loadLiveRates();
  // Fares come from Hunu's API and published lists, which the page can read itself.
  const trip = parseTrip(trimmed, loc);
  if (trip) return runTravelSearch(trip, trimmed, profile, signal);

  const timed = async <T,>(source: SourceReport['source'], run: (onIssue: (i: string) => void) => Promise<T[]>) => {
    const started = Date.now();
    const issues: string[] = [];
    const rows = await run((i) => issues.push(i)).catch((e) => {
      issues.push(String(e?.message || e));
      return [] as T[];
    });
    const report: SourceReport = { source, ok: !(issues.length > 0 && rows.length === 0), count: rows.length, ms: Date.now() - started };
    if (issues.length) report.error = issues.join('; ');
    return { rows, report };
  };

  const [server, community, shops] = await Promise.all([
    fetchText(`${HUNU_API_URL}/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: trimmed, lat: loc.latitude, lon: loc.longitude, city: loc.city, region: loc.stateOrRegion, country: loc.country, category }),
      signal,
      timeoutMs: 30_000,
      cacheTtlMs: 10 * 60 * 1000
    }),
    timed('community', (onIssue) => searchCommunityPrices(trimmed, loc, { signal, onIssue, category })),
    timed('shops', (onIssue) => searchCommunityShops(trimmed, loc, { signal, onIssue, category }))
  ]);

  let result: LiveSearchResult;
  if (server.ok) {
    try {
      result = JSON.parse(server.text) as LiveSearchResult;
    } catch {
      result = { ...empty, sources: [{ source: 'web', ok: false, count: 0, ms: 0, error: 'unreadable answer from Hunu' }] };
    }
  } else {
    const why = server.status === 429 ? 'too many searches, try again in a few minutes' : server.error || `HTTP ${server.status}`;
    result = { ...empty, sources: [{ source: 'web', ok: false, count: 0, ms: 0, error: why }] };
  }

  // Exact delivery from the Shopify stores' own checkouts, capped like the extension's.
  await Promise.race([
    enrichShopifyDelivery(result.webVendors, loc, signal).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 7000))
  ]);

  return {
    ...result,
    query: trimmed,
    communityPrices: community.rows,
    communityShops: shops.rows,
    sources: [...(result.sources || []).filter((s) => s.source !== 'community' && s.source !== 'shops'), community.report, shops.report],
    fromCache: false
  };
}
