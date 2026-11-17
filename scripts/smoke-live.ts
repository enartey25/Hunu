/**
 * Live smoke test: runs the real sources for a few queries and prints the ranking.
 * Needs network access. Usage: npm run test:live -- "arduino uno r3" "laptop"
 *
 * A browser sends its own User-Agent; Node does not, and the sources reject requests
 * without one, so this script adds a browser-like one. Nothing else differs from the
 * extension's code path.
 */
import { runLiveSearch } from '../src/engine/liveSearch';
import { searchAndRankVendors } from '../src/engine/searchEngine';
import { SEED_VENDORS } from '../src/engine/vendorDatabase';
import { getSimilarProductRecommendations } from '../src/engine/similarRecommendations';
import { CompanyProfile } from '../src/engine/types';
import { ratesStatus, unitsPerUSD } from '../src/engine/currency';

const realFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  // OpenStreetMap asks scripts to identify themselves rather than pose as a browser.
  const isMap = String(input).includes('nominatim.openstreetmap.org');
  headers.set(
    'User-Agent',
    isMap
      ? 'HunuSmokeTest/1.0'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  );
  headers.set('Accept-Language', 'en-US,en;q=0.9');
  return realFetch(input, { ...init, headers });
}) as typeof fetch;

const profile: CompanyProfile = {
  id: 'smoke',
  userRole: 'student',
  companyName: 'Smoke',
  industry: 'Academic Research & Engineering',
  headcount: '1-10',
  budgetTier: 'Bootstrap',
  location: {
    city: 'Accra',
    stateOrRegion: 'Greater Accra',
    country: 'Ghana',
    latitude: 5.556,
    longitude: -0.197,
    maxPreferredDistanceKm: 0
  },
  priorityWeights: { priceWeight: 0.45, locationWeight: 0.25, fitWeight: 0.2, qualityWeight: 0.1 },
  preferredContract: 'any'
};

const queries = process.argv.slice(2);
if (queries.length === 0) queries.push('arduino uno r3', 'resistor wholesale supplier');

(async () => {
  let anyWeb = false;
  for (const query of queries) {
    console.log(`\n=== "${query}" ===`);
    const live = await runLiveSearch(query, profile);
    for (const s of live.sources) {
      console.log(`  source ${s.source.padEnd(5)} ${s.ok ? 'ok  ' : 'FAIL'} ${String(s.count).padStart(2)} rows in ${s.ms} ms${s.error ? ` (${s.error})` : ''}`);
    }
    const fx = ratesStatus();
    console.log(`  rate: 1 USD = GHS ${unitsPerUSD('GHS')} (${fx.live ? `live, updated ${new Date(fx.updatedAt || 0).toISOString().slice(0, 10)}` : 'reference rate, live rates unavailable'})`);
    for (const v of live.webVendors.filter((x) => x.discountPercent)) {
      console.log(`    ${v.discountPercent}% off: ${v.name.slice(0, 60)} | ${v.keyFeatures.find((k) => k.startsWith('Was '))}`);
    }
    for (const s of live.stores) {
      console.log(`    store ${s.name.padEnd(14)} ${s.ok ? `${String(s.count).padStart(2)} listings` : `FAIL (${s.error})`}  ${s.searchUrl}`);
    }
    anyWeb = anyWeb || live.webVendors.length > 0;

    const pool = [...live.webVendors, ...live.localStores, ...SEED_VENDORS];
    const ranked = searchAndRankVendors(profile, { query }, pool, live.deals);
    ranked.slice(0, 12).forEach((r, i) => {
      const price = r.vendor.priceKnown === false ? 'no price' : `$${r.roiEstimate.annualCostEst} +$${r.shippingEstimate.estimatedCostUSD} ship`;
      const dist = r.breakdown.distanceKm !== undefined ? `${r.breakdown.distanceKm} km` : 'online';
      console.log(
        `  ${String(i + 1).padStart(2)}. [${String(r.totalValueScore).padStart(3)}] ${r.vendor.name.slice(0, 62).padEnd(62)} ${price.padEnd(22)} ${dist.padEnd(8)} match ${r.breakdown.relevanceScore} ${r.priceConfidence}`
      );
      console.log(`        ${(r.reasons || []).slice(0, 3).join(' · ')}`);
    });
    const deals = live.deals.filter((d) => !d.verified);
    if (deals.length) console.log(`  unverified web deals: ${deals.map((d) => `${d.dealTitle}${d.promoCode ? ` [${d.promoCode}]` : ''}`).join(' | ')}`);
    console.log(`  alternatives: ${getSimilarProductRecommendations(query).map((r) => r.name).join(' | ') || 'none'}`);
  }
  if (!anyWeb) {
    console.error('\nNo web listings came back for any query. The search source may be blocking this network.');
    process.exit(1);
  }
})();
