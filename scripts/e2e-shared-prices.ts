/**
 * End-to-end check of shared prices against the deployed API, using the extension's own
 * client code: share a quote (Function -> Postgres), see it pushed to a live subscriber
 * (Realtime), find it with a normal search (GET), confirm it from another device and
 * watch the count change live, then flag it twice and watch it disappear.
 *
 *   npm run test:e2e
 *
 * Uses a made-up product name so no real report is touched; the test rows are removed
 * by `npm run cleanup:e2e` in server/ afterwards.
 */
import {
  HUNU_API_URL,
  communityEnabled,
  fetchSellerRatings,
  rateSeller,
  searchCommunityPrices,
  searchCommunityShops,
  shareQuote,
  shareShop,
  watchCommunityPrices
} from '../src/engine/communityPrices';
import { productQuoteToVendor } from '../src/engine/quote';
import { shopPinToVendor } from '../src/engine/shopPins';
import { GeoLocation, VendorService } from '../src/engine/types';

const accra: GeoLocation = { city: 'Accra', stateOrRegion: 'Greater Accra', country: 'Ghana', latitude: 5.556, longitude: -0.197 };
const PRODUCT = 'hunutest zx81 kettle';
const SHOP = 'Hunutest ZX81 Stall';

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

async function waitFor<T>(label: string, read: () => T | undefined, ms = 30_000): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < ms) {
    const value = read();
    if (value !== undefined) {
      console.log(`  ok   ${label} (${Date.now() - started} ms)`);
      return value;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return fail(`timed out waiting for: ${label}`);
}

async function vote(id: number, kind: 'confirm' | 'flag', device: string, what: 'reports' | 'shops' | 'sellers/ratings' = 'reports') {
  const res = await fetch(`${HUNU_API_URL}/${what}/${id}/${kind}`, { method: 'POST', headers: { 'x-hunu-device': device } });
  return (await res.json()) as { counted?: boolean };
}

async function main() {
  if (!communityEnabled()) fail('HUNU_API_URL is not set for this build');
  console.log(`API: ${HUNU_API_URL}`);

  // 1. Functions: the deployed API answers, with Realtime configured.
  const health = (await (await fetch(`${HUNU_API_URL}/?t=${Date.now()}`)).json()) as { ok: boolean; live: boolean };
  console.log('  health', JSON.stringify(health));
  if (!health.ok || !health.live) fail('API is not healthy or live prices are off');

  // 2. Realtime: subscribe before anything exists.
  let latest: VendorService[] | undefined;
  const stop = watchCommunityPrices(PRODUCT, accra, (rows) => {
    latest = rows;
    console.log(`  push ${rows.length} row(s)${rows[0] ? `: ${rows[0].name}, confirmations ${rows[0].communityReport?.confirmations}` : ''}`);
  });
  await waitFor('live subscription delivered its initial (empty) result', () => (latest && latest.length === 0 ? true : undefined));

  // 3. Postgres via the Function: share a quote the way the quote modal does.
  const quote = productQuoteToVendor({ product: PRODUCT, amount: 250, currency: 'GHS', sellerName: 'E2E Test Seller', area: 'Circle', location: accra })!;
  if (!(await shareQuote(quote, false))) fail('sharing the quote was refused');
  console.log('  ok   quote shared (POST /reports)');

  const pushed = await waitFor('Realtime pushed the new report', () => latest?.find((v) => v.quotedProduct === PRODUCT));
  const id = pushed.communityReport!.id;

  // 4. The ordinary search finds it too.
  const found = await searchCommunityPrices(PRODUCT, accra);
  if (!found.some((v) => v.communityReport?.id === id)) fail('GET /reports did not return the shared price');
  console.log(`  ok   GET /reports returned it: ${found[0].pricing.startingTierLabel}, ${found[0].location.city}`);

  // 5. A confirmation from another device arrives live.
  if (!(await vote(id, 'confirm', 'e2e-device-bbbbbbbbbbbb')).counted) fail('confirmation not counted');
  await waitFor('Realtime pushed confirmations = 1', () =>
    latest?.find((v) => v.communityReport?.id === id && v.communityReport.confirmations === 1) ? true : undefined
  );

  // 6. Two flags hide it, live.
  await vote(id, 'flag', 'e2e-device-cccccccccccc');
  await vote(id, 'flag', 'e2e-device-dddddddddddd');
  await waitFor('Realtime removed the report after two flags', () =>
    latest && !latest.some((v) => v.communityReport?.id === id) ? true : undefined
  );

  stop();
  console.log(`PASS: shared prices work end to end (report ${id}).`);

  // 7. Shop pins: share one, find it by what it sells, confirm it, flag it away.
  const pin = shopPinToVendor({
    name: SHOP,
    sells: 'zx81 kettles and toasters',
    area: 'Makola',
    phone: '024 412 3456',
    latitude: 5.548,
    longitude: -0.21,
    buyer: accra
  })!;
  if (!(await shareShop(pin, 'zx81 kettles and toasters'))) fail('sharing the shop pin was refused');
  console.log('  ok   shop pin shared (POST /shops)');
  const shops = await searchCommunityShops('zx81 kettle', accra);
  const sharedPin = shops.find((v) => v.name === SHOP);
  if (!sharedPin?.communityShop) fail('GET /shops did not return the pinned shop');
  console.log(`  ok   GET /shops returned it at ${sharedPin.location.latitude}, ${sharedPin.location.longitude} (${sharedPin.location.city})`);
  const shopId = sharedPin.communityShop.id;
  if (!(await vote(shopId, 'confirm', 'e2e-device-bbbbbbbbbbbb', 'shops')).counted) fail('shop confirmation not counted');
  console.log('  ok   shop confirmed by another device');
  await vote(shopId, 'flag', 'e2e-device-cccccccccccc', 'shops');
  await vote(shopId, 'flag', 'e2e-device-dddddddddddd', 'shops');
  // The search is cached for a minute at the edge, so ask with different words.
  const after = await searchCommunityShops('zx81 toasters', accra);
  if (after.some((v) => v.communityShop?.id === shopId)) fail('a shop pin flagged twice is still served');
  console.log('  ok   shop pin hidden after two flags');
  console.log(`PASS: shared shop pins work end to end (shop ${shopId}).`);

  // 8. Seller ratings from Hunu buyers: rate, read back, change, flag away.
  const KEY = 'name:hunutest zx81 seller|circle';
  if ((await rateSeller(KEY, 2, 'Slow, but the item was fine 0244123456')) !== 'saved') fail('rating was refused');
  let ratings = await fetchSellerRatings([KEY]);
  const first = ratings.get(KEY);
  if (!first || first.count !== 1 || first.average !== 2 || /0244/.test(first.notes?.[0] || '')) fail(`rating not read back cleanly: ${JSON.stringify(first)}`);
  console.log(`  ok   rated and read back: ${first.average} stars from ${first.count}, note "${first.notes?.[0]}"`);
  if ((await rateSeller(KEY, 5, 'Came back and it was great')) !== 'saved') fail('re-rating was refused');
  ratings = await fetchSellerRatings([KEY, 'osm:1']);
  const changed = ratings.get(KEY);
  // The batch is cached for a minute at the edge; a new key set asks afresh.
  if (!changed || changed.count !== 1 || changed.average !== 5) fail(`re-rating did not replace the first: ${JSON.stringify(changed)}`);
  console.log('  ok   the same device rating again changes its rating, not adds one');
  const ratingId = changed.noteItems?.[0]?.id;
  if (!ratingId) fail('rating id missing');
  await vote(ratingId!, 'flag', 'e2e-device-cccccccccccc', 'sellers/ratings' as 'reports');
  await vote(ratingId!, 'flag', 'e2e-device-dddddddddddd', 'sellers/ratings' as 'reports');
  ratings = await fetchSellerRatings([KEY, 'osm:2']);
  if (ratings.get(KEY)) fail('a rating flagged twice is still served');
  console.log('  ok   rating hidden after two flags');
  console.log('PASS: seller ratings work end to end.');

  // 9. The website's search, run by the API.
  const started = Date.now();
  const res = await fetch(`${HUNU_API_URL}/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ q: 'hp laptop', lat: accra.latitude, lon: accra.longitude, city: 'Accra', region: 'Greater Accra', country: 'Ghana' })
  });
  const searched = (await res.json()) as { webVendors?: unknown[]; localStores?: unknown[]; stores?: { name: string; ok: boolean; count: number }[] };
  if (!res.ok || !searched.webVendors || searched.webVendors.length === 0) fail(`server search returned nothing: ${res.status}`);
  console.log(`  ok   POST /search: ${searched.webVendors!.length} listings, ${searched.localStores?.length ?? 0} map shops in ${Date.now() - started} ms`);
  console.log(`       stores: ${(searched.stores || []).map((s) => `${s.name} ${s.ok ? s.count : 'refused'}`).join(', ')}`);
  console.log('PASS: the website search works through the API.');

  // 10. Trips: flight fares (when the Travelpayouts key is set) and watched routes.
  const flights = await fetch(`${HUNU_API_URL}/travel/flights`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ origin: 'ACC', destination: 'LON' })
  });
  const flightBody = (await flights.json()) as { fares?: unknown[]; error?: string };
  if (flights.status === 503) console.log(`  note POST /travel/flights: ${flightBody.error} (fares appear once the key is set)`);
  else if (!flights.ok || !Array.isArray(flightBody.fares)) fail(`fare search failed: ${flights.status} ${flightBody.error}`);
  else console.log(`  ok   POST /travel/flights ACC→LON: ${flightBody.fares!.length} fares`);

  const watchDevice = 'e2e-device-wwwwwwwwwwww';
  const headers = { 'content-type': 'application/json', 'x-hunu-device': watchDevice };
  const made = await fetch(`${HUNU_API_URL}/travel/watch`, { method: 'POST', headers, body: JSON.stringify({ origin: 'ACC', destination: 'LON', date: '2027-03', label: 'Accra → London', price: 9000 }) });
  const watchId = ((await made.json()) as { id?: number }).id;
  if (made.status !== 201 || !watchId) fail(`watching a route failed: ${made.status}`);
  const listed = ((await (await fetch(`${HUNU_API_URL}/travel/watches`, { headers })).json()) as { watches: { id: number; lastPrice: number | null }[] }).watches;
  if (!listed.some((w) => w.id === watchId && w.lastPrice === 9000)) fail(`watched route not listed: ${JSON.stringify(listed)}`);
  console.log('  ok   route watched and listed with its starting price');
  const forged = await fetch(`${HUNU_API_URL}/travel/check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ invocation_id: 'x' }) });
  if (forged.status !== 401) fail(`the daily check accepted a call that was not Neon's trigger: ${forged.status}`);
  console.log('  ok   the daily check refuses calls that are not the trigger');
  const removed = (await (await fetch(`${HUNU_API_URL}/travel/watch/${watchId}/delete`, { method: 'POST', headers })).json()) as { deleted: boolean };
  if (!removed.deleted) fail('stopping the watch failed');
  console.log('  ok   watch removed');
  console.log('PASS: trips work through the API.');
  process.exit(0);
}

main().catch((err) => fail(String(err?.stack || err)));
