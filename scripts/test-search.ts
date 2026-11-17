/**
 * Offline tests for search, relevance, ranking and the parsers behind the live sources.
 * No network: live behaviour is covered by scripts/smoke-live.ts.
 */
import { parseB2BSearchQuery } from '../src/engine/queryParser';
import { searchAndRankVendors, findDealForVendor } from '../src/engine/searchEngine';
import { calculateQualityScore, scoreVendor } from '../src/engine/scoring';
import { SEED_VENDORS } from '../src/engine/vendorDatabase';
import { CompanyProfile, VendorService } from '../src/engine/types';
import { parsePrices, pickListingPrice, extractOfferFromHtml, findDiscount, findPromoCode } from '../src/engine/priceParser';
import { parseBingResultsHtml, classifyPage, buildSearchQueries, pickStoreListings, broaderQueries } from '../src/engine/liveWebScraper';
import { parseJiji, parseJumia, parseShopifySuggest, parseAliExpress, parseAmazon, parseAdafruit, storesFor, STORE_SOURCES } from '../src/engine/storeSources';
import { storeTypesForQuery } from '../src/engine/liveLocalSearcher';
import { matchCuratedDeals, getCuratedDeals, LiveWebDeal } from '../src/engine/liveWebDealFinder';
import { getSimilarProductRecommendations } from '../src/engine/similarRecommendations';
import { applyRates, formatCurrencyAmount, ratesStatus, toUSD, unitsPerUSD } from '../src/engine/currency';
import { judgePageDeal, pageDealToVendor, queryFromTitle } from '../src/engine/pageDeal';
import { parseTrip } from '../src/engine/tripParser';
import { ghanaRows, apiFareToRow } from '../src/engine/travelSearch';

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.error(`  FAIL: ${name}`, detail === undefined ? '' : JSON.stringify(detail, null, 2));
  }
}

const student: CompanyProfile = {
  id: 'p',
  userRole: 'student',
  companyName: 'Test',
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

function webVendor(id: string, title: string, domain: string, priceUSD?: number, extra: Partial<VendorService> = {}): VendorService {
  return {
    id: `web-scraped-${id}`,
    name: `${title} (${domain})`,
    category: 'Lab Components & Hardware',
    serviceType: 'hybrid',
    targetAudience: ['student', 'business', 'supply_chain'],
    location: { city: 'Online', stateOrRegion: domain, country: 'International', latitude: 0, longitude: 0 },
    pricing: {
      baseMonthlyCost: priceUSD ?? 0,
      pricingModel: 'per_unit',
      currency: 'USD',
      startingTierLabel: priceUSD ? `$${priceUSD}` : 'Price on site',
      contractTerm: 'per_item'
    },
    targetIndustries: ['All'],
    targetHeadcount: ['1-10'],
    complianceCertifications: [],
    rating: 0,
    reviewsCount: 0,
    slaGuarantee: `Order on ${domain}`,
    summary: `${title} available on ${domain}.`,
    keyFeatures: [`Sold on ${domain}`],
    hasOfficialWebsite: true,
    websiteUrl: `https://${domain}/products/${id}`,
    exactOrderUrl: `https://${domain}/products/${id}`,
    dataSource: 'web',
    priceKnown: priceUSD !== undefined,
    priceSource: priceUSD !== undefined ? 'page' : undefined,
    ratingKnown: false,
    locationKnown: false,
    ...extra
  };
}

// ---------------------------------------------------------------------------------
console.log('[1] Query understanding');
{
  const chromebook = parseB2BSearchQuery('chromebook');
  check('"chromebook" is not classified as Payroll & HR', chromebook.category !== 'Payroll & HR', chromebook);

  const label = parseB2BSearchQuery('label printer');
  check('"label printer" is not classified as Lab Components', label.category !== 'Lab Components & Hardware', label);

  const taxi = parseB2BSearchQuery('taxi to airport');
  check('"taxi" is not classified as Accounting & Tax', taxi.category !== 'Accounting & Tax', taxi);

  const q = parseB2BSearchQuery('cheap Arduino Uno R3 under $30 near Legon');
  check('core query strips filler, budget and place', q.coreQuery === 'arduino uno r3', q.coreQuery);
  check('budget is read as $30', q.maxPriceUSD === 30, q.maxPriceUSD);
  check('location is Legon', q.extractedLocation === 'Legon', q.extractedLocation);
  check('deal and local intents detected', q.intents.includes('deal') && q.intents.includes('local'), q.intents);
  check('model number detected', q.hasModelNumber);
  check('category is Lab Components with high confidence', q.category === 'Lab Components & Hardware' && q.categoryConfidence >= 0.9, q);

  const cedis = parseB2BSearchQuery('laptop below 7800 cedis');
  check('budget in cedis converts to USD at the rate in use', Math.abs((cedis.maxPriceUSD ?? 0) - 7800 / unitsPerUSD('GHS')!) < 0.01, cedis.maxPriceUSD);

  const supplier = parseB2BSearchQuery('resistor wholesale supplier');
  check('supplier intent detected', supplier.intents.includes('supplier'), supplier.intents);
  check('supplier words are not part of the subject', supplier.coreQuery === 'resistor', supplier.coreQuery);

  const service = parseB2BSearchQuery('payroll software for 20 employees');
  check('service intent for a B2B service', service.intents.includes('service') && service.category === 'Payroll & HR', service);
}

// ---------------------------------------------------------------------------------
console.log('[2] Relevance over the catalogue');
{
  const typo = searchAndRankVendors(student, { query: 'ardiuno' }, SEED_VENDORS);
  check('typo "ardiuno" still finds Arduino sellers', typo.some((r) => r.vendor.id === 'adafruit-sparkfun-kits'), typo.map((r) => r.vendor.id));

  const resistor = searchAndRankVendors(student, { query: 'resistor' }, SEED_VENDORS);
  check('"resistor" finds component distributors', resistor.some((r) => r.vendor.id === 'digikey-academic'), resistor.map((r) => r.vendor.id));
  check('"resistor" returns no food or flight sellers', resistor.every((r) => r.vendor.category === 'Lab Components & Hardware'), resistor.map((r) => r.vendor.category));

  const chrome = searchAndRankVendors(student, { query: 'chromebook' }, SEED_VENDORS);
  check('"chromebook" does not return HR vendors', !chrome.some((r) => r.vendor.category === 'Payroll & HR'), chrome.map((r) => r.vendor.id));

  const flights = searchAndRankVendors(student, { query: 'cheap flights to London' }, SEED_VENDORS);
  check('flight search ranks a flight seller first', flights[0]?.vendor.category === 'Student Flights & Travel', flights.map((r) => r.vendor.id));

  const digikey = scoreVendor(SEED_VENDORS.find((v) => v.id === 'digikey-academic')!, student);
  check('a one-off purchase is not multiplied by 12', digikey.roiEstimate.annualCostEst === 25, digikey.roiEstimate);
}

// ---------------------------------------------------------------------------------
console.log('[3] Ranking live offers');
{
  const pool: VendorService[] = [
    webVendor('a', 'Arduino Uno R3 Development Board', 'shop-a.com', 27),
    webVendor('b', 'Arduino Uno R3', 'shop-b.com', 21),
    webVendor('c', 'Arduino Uno R3 ATmega328P', 'shop-c.com', 24),
    webVendor('d', 'Arduino Uno R3 Original', 'shop-d.com', 38),
    webVendor('e', 'Arduino Uno R3 board', 'shop-e.com'),
    webVendor('f', 'Acrylic case for Arduino Uno R3', 'shop-f.com', 3),
    webVendor('g', 'Arduino Uno R4 Minima', 'shop-g.com', 20),
    webVendor('h', 'Raspberry Pi 5 8GB', 'shop-h.com', 15),
    ...SEED_VENDORS
  ];
  const results = searchAndRankVendors(student, { query: 'arduino uno r3' }, pool);
  const ids = results.map((r) => r.vendor.id.replace('web-scraped-', ''));
  const byId = (id: string) => results.find((r) => r.vendor.id === `web-scraped-${id}`);

  check('cheapest exact match ranks first', ids[0] === 'b', ids);
  check('price order holds among exact matches (b < c < a < d)', ids.indexOf('b') < ids.indexOf('c') && ids.indexOf('c') < ids.indexOf('a') && ids.indexOf('a') < ids.indexOf('d'), ids);
  check('an unrelated product is not returned', !ids.includes('h'), ids);
  check('offer with no price never ranks first', ids[0] !== 'e' && ids.includes('e'), ids);
  check('offer with no price is not badged as free', !byId('e')!.badges.some((b) => /free/i.test(b)), byId('e')!.badges);
  check('offer with no price gets the neutral price score', byId('e')!.breakdown.priceScore === 50, byId('e')!.breakdown);
  check('prices are compared against the other offers found', byId('b')!.priceBasis === 'peers' && (byId('b')!.peerCount ?? 0) >= 4, byId('b'));
  check('a case for the product is left out as an accessory', !ids.includes('f') && results.accessoryCount === 1, ids);
  const withAddOns = searchAndRankVendors(student, { query: 'arduino uno r3', includeAccessories: true }, pool);
  const caseRow = withAddOns.find((r) => r.vendor.id === 'web-scraped-f');
  check('asked for, the case is shown, marked, and ranked below the board', !!caseRow?.accessory && withAddOns.indexOf(caseRow) > withAddOns.findIndex((r) => r.vendor.id === 'web-scraped-b'), withAddOns.map((r) => r.vendor.id));
  const clone = searchAndRankVendors(student, { query: 'arduino uno r3' }, [...pool, webVendor('k', 'Arduino Uno R3 clone', 'shop-k.com', 3)]);
  const cloneRow = clone.find((r) => r.vendor.id === 'web-scraped-k');
  check('a far-too-cheap listing is flagged, not rewarded', cloneRow?.breakdown.priceScore === 60 && clone.indexOf(cloneRow) > clone.findIndex((r) => r.vendor.id === 'web-scraped-b'), cloneRow?.reasons);
  check('a different model (R4) ranks below the R3 matches', ids.indexOf('g') > ids.indexOf('d') || !ids.includes('g'), ids);
  check('every result explains its rank', results.every((r) => (r.reasons?.length ?? 0) > 0));
  check('relevance is reported in the breakdown', byId('b')!.breakdown.relevanceScore !== undefined && byId('b')!.breakdown.relevanceScore! >= 80, byId('b')!.breakdown);

  const cheapest = searchAndRankVendors(student, { query: 'arduino uno r3', sortBy: 'price_asc' }, pool);
  const lastPriced = cheapest.map((r) => r.vendor.priceKnown !== false).lastIndexOf(true);
  const firstUnpriced = cheapest.findIndex((r) => r.vendor.priceKnown === false);
  check('"cheapest" sort puts unpriced offers last', firstUnpriced === -1 || firstUnpriced > lastPriced, cheapest.map((r) => r.vendor.id));

  const budget = searchAndRankVendors(student, { query: 'arduino uno r3 under $25' }, pool);
  check('"under $25" drops offers over budget', !budget.some((r) => r.vendor.id === 'web-scraped-d') && budget.some((r) => r.vendor.id === 'web-scraped-b'), budget.map((r) => r.vendor.id));

  const outOfStock = searchAndRankVendors(student, { query: 'arduino uno r3' }, [
    webVendor('x', 'Arduino Uno R3', 'shop-x.com', 20, { availability: 'out_of_stock' }),
    webVendor('y', 'Arduino Uno R3', 'shop-y.com', 23, { availability: 'in_stock' }),
    webVendor('z', 'Arduino Uno R3', 'shop-z.com', 24)
  ]);
  check('an out-of-stock offer ranks below an in-stock one', outOfStock[0].vendor.id !== 'web-scraped-x', outOfStock.map((r) => r.vendor.id));

  const local: VendorService = webVendor('l', 'Prosper Electronics', 'none', undefined, {
    id: 'osm-local-1',
    name: 'Prosper Electronics',
    serviceType: 'local_physical',
    dataSource: 'local',
    locationKnown: true,
    location: { city: 'Accra', stateOrRegion: 'Greater Accra', country: 'Ghana', latitude: 5.587, longitude: -0.2017 },
    hasOfficialWebsite: false,
    websiteUrl: '',
    relevanceHint: 0.45,
    matchBasis: 'A local electronics shop: the kind of store that stocks this'
  });
  const withLocal = searchAndRankVendors(student, { query: 'arduino uno r3' }, [...pool, local]);
  const localRow = withLocal.find((r) => r.vendor.id === 'osm-local-1');
  check('a nearby store of the right kind is included', !!localRow, withLocal.map((r) => r.vendor.id));
  check('the local store shows a real distance and no shipping', !!localRow && localRow.breakdown.distanceKm !== undefined && localRow.breakdown.distanceKm < 10 && localRow.shippingEstimate.estimatedCostUSD === 0, localRow?.shippingEstimate);
  check('the local store says why it was matched', !!localRow && localRow.reasons![0].includes('local electronics shop'), localRow?.reasons);
}

// ---------------------------------------------------------------------------------
console.log('[3b] Accessories are not the product');
{
  const idsOf = (rs: { vendor: VendorService }[]) => rs.map((r) => r.vendor.id.replace('web-scraped-', ''));
  const phones: VendorService[] = [
    webVendor('p1', 'Apple iPhone 15 128GB Black', 'jiji.com.gh', 700),
    webVendor('p2', 'iPhone 15 Pro Max 256GB Natural Titanium + Free Case', 'jumia.com.gh', 1100),
    webVendor('p3', 'Apple iPhone 15', 'compughana.com', 760),
    webVendor('a1', 'iPhone 15 Silicone Case with MagSafe', 'jumia.com.gh', 12),
    webVendor('a2', 'Tempered Glass Screen Protector for iPhone 15', 'jumia.com.gh', 4),
    webVendor('a3', 'iPhone 15 20W USB-C Fast Charger Adapter', 'jumia.com.gh', 15),
    webVendor('a4', 'Car Phone Holder Mount iPhone 15', 'jumia.com.gh', 8),
    webVendor('a5', 'Black and Gold Case iPhone 15', 'jumia.com.gh', 6)
  ];
  const phone = searchAndRankVendors(student, { query: 'iphone 15' }, phones);
  const ids = idsOf(phone);
  check('a phone search leaves out cases, screen protectors, chargers and holders', !ids.some((id) => id.startsWith('a')) && phone.accessoryCount === 5, ids);
  check('phones are kept, including one sold with a free case', ['p1', 'p2', 'p3'].every((id) => ids.includes(id)), ids);
  check('accessories are not counted in the typical price', phone.find((r) => r.vendor.id === 'web-scraped-p1')?.peerCount === 3, phone.map((r) => r.peerCount));
  const shown = searchAndRankVendors(student, { query: 'iphone 15', includeAccessories: true }, phones);
  check('asked for, every accessory is shown and marked', shown.filter((r) => r.accessory).length === 5 && shown.length === phones.length, idsOf(shown));
  const caseSearch = searchAndRankVendors(student, { query: 'iphone 15 case' }, phones);
  check('a search for a case shows cases', idsOf(caseSearch).includes('a1') && caseSearch.accessoryCount === 0, idsOf(caseSearch));

  const plus = searchAndRankVendors(student, { query: 'iphone 15 plus' }, [
    webVendor('q1', 'iPhone 15 Plus 128GB', 'jiji.com.gh', 820),
    webVendor('q2', 'Apple iPhone 15 Plus', 'jumia.com.gh', 860),
    webVendor('q3', 'iPhone 15 Plus Case Shockproof', 'jumia.com.gh', 9)
  ]);
  check('"Plus" in a phone\'s name is not read as "comes with"', idsOf(plus).join() !== '' && !idsOf(plus).includes('q3') && idsOf(plus).includes('q2'), idsOf(plus));

  const laptops = searchAndRankVendors(student, { query: 'hp laptop' }, [
    webVendor('l1', 'HP EliteBook 840 G5 Laptop Core i5 8GB RAM 256GB SSD', 'jiji.com.gh', 300),
    webVendor('l2', 'HP 250 G8 Laptop with bag and charger', 'jiji.com.gh', 350),
    webVendor('l3', 'HP Laptop Charger 65 W Blue Tip', 'jumia.com.gh', 14),
    webVendor('l4', 'Laptop Bag 15.6 inch Waterproof for HP', 'jumia.com.gh', 18),
    webVendor('l5', 'HP Pavilion 15 Laptop backlit keyboard 16GB RAM', 'jumia.com.gh', 520),
    webVendor('l6', 'HP Laptop Replacement Battery', 'jumia.com.gh', 30)
  ]);
  check('a laptop search leaves out its charger, bag and battery', idsOf(laptops).sort().join() === 'l1,l2,l5', idsOf(laptops));

  // No prices to go on: the title decides, because the search names a device.
  const unpriced = searchAndRankVendors(student, { query: 'samsung a54' }, [
    webVendor('s1', 'Samsung Galaxy A54 5G', 'jiji.com.gh'),
    webVendor('s2', 'Samsung Galaxy A54 Back Cover', 'jumia.com.gh'),
    webVendor('s3', 'Samsung Galaxy A54 phone, 5000mAh battery', 'jiji.com.gh')
  ]);
  check('without prices, a brand and model still name a device', idsOf(unpriced).sort().join() === 's1,s3', idsOf(unpriced));

  // A brand search is not a device search: Oraimo is known for its chargers and earbuds.
  const oraimo = searchAndRankVendors(student, { query: 'oraimo' }, [
    webVendor('o1', 'Oraimo 20000mAh Power Bank', 'jumia.com.gh', 15),
    webVendor('o2', 'Oraimo FreePods 4 earbuds', 'jumia.com.gh', 20),
    webVendor('o3', 'Oraimo 18W Fast Charger', 'jumia.com.gh', 8)
  ]);
  check('a brand search keeps the brand\'s chargers and earbuds', oraimo.length === 3 && oraimo.accessoryCount === 0, idsOf(oraimo));

  const airpods = searchAndRankVendors(student, { query: 'airpods pro 2' }, [
    webVendor('e1', 'Apple AirPods Pro 2 wireless earbuds charging case', 'jumia.com.gh', 240),
    webVendor('e2', 'AirPods Pro 2', 'jiji.com.gh', 230),
    webVendor('e3', 'AirPods Pro 2 Case Cover Silicone', 'jumia.com.gh', 6)
  ]);
  check('earbuds priced like earbuds are the product; a cover for them is not', idsOf(airpods).sort().join() === 'e1,e2', idsOf(airpods));

  // Clone AirPods in Ghana cost about what a replacement case does, so price cannot tell.
  const clones = searchAndRankVendors(student, { query: 'airpods pro' }, [
    webVendor('c1', 'Airpods Pro 2nd Generation', 'jiji.com.gh', 22),
    webVendor('c2', 'Apple Airpods Pro', 'jiji.com.gh', 17),
    webVendor('c3', 'Replacement Original Charging Box For Airpods Pro 1 2 3', 'aliexpress.com', 24)
  ]);
  check('a replacement part is hidden even when priced like the product', idsOf(clones).sort().join() === 'c1,c2', idsOf(clones));
  const warranty = searchAndRankVendors(student, { query: 'iphone 15' }, [
    webVendor('w1', 'Apple iPhone 15 128GB 1 year replacement warranty', 'shop.com.gh', 760),
    webVendor('w2', 'Apple iPhone 15', 'jiji.com.gh', 700)
  ]);
  check('"replacement warranty" is a promise about the phone, not a part', idsOf(warranty).sort().join() === 'w1,w2', idsOf(warranty));

  const printer = searchAndRankVendors(student, { query: 'hp printer' }, [
    webVendor('r1', 'HP DeskJet Ink Advantage 2875 All-in-One Printer', 'jumia.com.gh'),
    webVendor('r2', 'HP Printer 305 Black Ink Cartridge', 'jumia.com.gh')
  ]);
  check('"Ink Advantage" is a printer, an ink cartridge is not', idsOf(printer).join() === 'r1', idsOf(printer));

  // Titles seen on Jiji and AliExpress for these searches.
  const parts = searchAndRankVendors(student, { query: 'samsung a15' }, [
    webVendor('m1', 'New Samsung Galaxy A15 128 GB Gray', 'jiji.com.gh', 157),
    webVendor('m2', 'Samsung Galaxy A15 128 GB Blue', 'jiji.com.gh', 140),
    webVendor('m3', 'Samsung Galaxy A15 6.5 inch display', 'jiji.com.gh', 150),
    webVendor('m4', 'A15 Screen', 'jiji.com.gh', 64),
    webVendor('m5', 'Samsung A15 Galaxy Motherboard For Samsung Galaxy A15 5G SM-A155F 128GB', 'aliexpress.com', 140),
    webVendor('m6', 'Samsung USB Flash Drive 64GB 128GB for Galaxy A15 phone', 'aliexpress.com', 9)
  ]);
  check('a replacement screen, a motherboard and a flash drive are not the phone', idsOf(parts).sort().join() === 'm1,m2,m3', idsOf(parts));
  const ssd = searchAndRankVendors(student, { query: 'hp laptop' }, [
    webVendor('d1', 'HP EliteBook 840 G6 8GB Intel Core i5 SSD 256GB', 'jiji.com.gh', 383),
    webVendor('d2', 'Netac NVMe SSD M2 1TB 2TB 500GB PCIe3.0 Internal Solid State Drive for HP Laptop', 'aliexpress.com', 37)
  ]);
  check('a drive "for HP laptop" is a part even though it lists capacities', idsOf(ssd).join() === 'd1', idsOf(ssd));

  // The stores' own results: accessories cannot take a store's few places.
  const listing = (title: string, rank: number, priceUSD: number) => ({
    title,
    url: `https://www.jumia.com.gh/p${rank}`,
    domain: 'jumia.com.gh',
    store: 'Jumia Ghana',
    price: { amount: priceUSD, currency: 'USD', amountUSD: priceUSD, raw: `$${priceUSD}` },
    snippet: '',
    rank
  });
  const fromJumia = pickStoreListings(
    [
      listing('iPhone 15 Clear Case', 0, 5),
      listing('iPhone 15 Screen Protector', 1, 3),
      listing('iPhone 15 Charger', 2, 9),
      listing('iPhone 15 Camera Lens Protector', 3, 4),
      listing('Apple iPhone 15 128GB', 4, 720),
      listing('Apple iPhone 15 256GB', 5, 830)
    ],
    ['iphone', '15'],
    10
  );
  check('a store\'s phones are picked before its accessories', fromJumia.length === 3 && /128GB/.test(fromJumia[0].title) && /256GB/.test(fromJumia[1].title) && !!fromJumia[2].accessory, fromJumia.map((l) => l.title));
}

// ---------------------------------------------------------------------------------
console.log('[4] Quality and deals');
{
  const base = webVendor('q', 'Thing', 'q.com', 10);
  const few = calculateQualityScore({ ...base, ratingKnown: true, rating: 5.0, reviewsCount: 3 });
  const many = calculateQualityScore({ ...base, ratingKnown: true, rating: 4.7, reviewsCount: 4000 });
  const none = calculateQualityScore(base);
  check('4.7 from 4,000 reviews beats 5.0 from 3', many > few, { many, few });
  check('an unrated seller scores neutral, between poor and excellent', none === 50, none);

  const adafruit = SEED_VENDORS.find((v) => v.id === 'adafruit-sparkfun-kits')!;
  const queryNamedDeal: LiveWebDeal = {
    id: 'x', vendorName: 'arduino', dealTitle: '70% off', dealDescription: '', discountPercent: 70,
    claimUrl: 'https://coupons.example.net/arduino', source: 'web', audience: 'all', verified: false,
    foundAt: 'Web search', vendorDomain: 'coupons.example.net'
  };
  check('a deal named after the search does not attach to unrelated sellers', findDealForVendor(adafruit, [queryNamedDeal]) === undefined);

  const github = SEED_VENDORS.find((v) => v.id === 'github-student-pack')!;
  check('a curated programme attaches to its own seller', findDealForVendor(github, getCuratedDeals())?.id === 'deal-github-pack');
  check('curated deals do not cross-attach', findDealForVendor(adafruit, getCuratedDeals()) === undefined);

  const shop = webVendor('s', 'Arduino Uno R3', 'shop-s.com', 30);
  const unverified = scoreVendor(shop, student, {
    title: 'Up to 40% off', description: '', discountPercent: 40, claimUrl: 'https://shop-s.com', source: 'shop-s.com', verified: false
  });
  check('an unverified discount is shown but does not change the price', unverified.roiEstimate.annualCostEst === 30 && unverified.badges[0].includes('unverified'), unverified.badges);

  check('curated deals match by whole word', matchCuratedDeals('student flight to Doha').some((d) => d.id === 'deal-qatar-student') && matchCuratedDeals('arduino').length === 0);
}

// ---------------------------------------------------------------------------------
console.log('[5] Reading prices and pages');
{
  check('"$1,299.00" parses with thousands separator', parsePrices('Now $1,299.00 today')[0]?.amountUSD === 1299);
  check('"GH₵450" converts from cedis', Math.abs(parsePrices('Price: GH₵450')[0]?.amountUSD - 450 / unitsPerUSD('GHS')!) < 0.01);
  check('"12,99 €" reads a decimal comma', parsePrices('nur 12,99 € inkl.')[0]?.amount === 12.99);
  check('"450 GHS" reads a trailing code', parsePrices('costs 450 GHS')[0]?.currency === 'GHS');
  check('savings and shipping thresholds are not the item price', pickListingPrice('Save $20 today. Free shipping over $50. Arduino Uno R3 $24.90 in stock')?.amount === 24.9);
  check('text with no price yields none', pickListingPrice('Arduino Uno R3 microcontroller board with ATmega328P') === undefined);
  check('"up to 40% off" is recognised as a ceiling', findDiscount('Up to 40% off dev boards')?.upTo === true);
  check('a promo code is extracted', findPromoCode('Use code STUDENT15 at checkout') === 'STUDENT15');
  check('ordinary prose is not a promo code', findPromoCode('the source code is available here') === undefined);

  const page = `<html><head><title>Arduino Uno R3</title>
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"Shop"},
    {"@type":"Product","name":"Arduino Uno Rev3","brand":{"@type":"Brand","name":"Arduino"},
     "aggregateRating":{"@type":"AggregateRating","ratingValue":"4.8","reviewCount":"1250"},
     "offers":[{"@type":"Offer","price":"29.30","priceCurrency":"EUR","availability":"https://schema.org/OutOfStock"},
               {"@type":"Offer","price":"27.60","priceCurrency":"USD","availability":"https://schema.org/InStock"}]}]}</script>
    </head><body></body></html>`;
  const offer = extractOfferFromHtml(page, ['arduino', 'uno']);
  check('JSON-LD: cheapest in-stock offer is read', offer?.price?.amountUSD === 27.6 && offer.availability === 'in_stock', offer);
  check('JSON-LD: rating and review count are read', offer?.rating === 4.8 && offer.reviewsCount === 1250, offer);

  const listing = `<script type="application/ld+json">[{"@type":"Product","name":"USB cable","offers":{"price":"2","priceCurrency":"USD"}},
    {"@type":"Product","name":"Jumper wires","offers":{"price":"3","priceCurrency":"USD"}}]</script>`;
  check('a category page about other products yields no price', extractOfferFromHtml(listing, ['arduino', 'uno']) === undefined);

  const meta = `<head><meta property="og:title" content="Arduino Uno R3"><meta property="product:price:amount" content="17.50"><meta property="product:price:currency" content="USD"></head>`;
  check('Open Graph product price is read as a fallback', extractOfferFromHtml(meta, ['arduino', 'uno'])?.price?.amountUSD === 17.5);

  // Store sources: each parser reads the shape its store really returns.
  const jiji = parseJiji(
    JSON.stringify({ adverts_list: { adverts: [
      { title: 'Arduino Uno R3', url: '/kumasi-metropolitan/tools/arduino-uno-r3-Jkl8.html?page=1&pos=2', price_obj: { value: 144, view: 'GH₵ 144' }, region_item_text: 'Ashanti, Kumasi Metropolitan', attrs: [{ name: 'Condition', value: 'Brand New' }], short_description: 'Uno board with cable' },
      { title: 'Arduino tutor wanted', url: '/jobs/x.html', is_job: true }
    ] } }),
    'https://jiji.com.gh', 'Jiji Ghana', 'Ghana', 'GHS'
  );
  check('Jiji: price, link, place and condition are read; job adverts dropped',
    jiji.length === 1 && jiji[0].price?.amount === 144 && jiji[0].price.currency === 'GHS' &&
    jiji[0].url === 'https://jiji.com.gh/kumasi-metropolitan/tools/arduino-uno-r3-Jkl8.html' &&
    jiji[0].place === 'Ashanti, Kumasi Metropolitan' && jiji[0].condition === 'Brand New', jiji);

  const jumiaPage = 'window.__STORE__={"viewData":{"products":[{"name":"E142N 14\\" Laptop [N3450]","displayName":"WSD E142N 14\\" Laptop [N3450]","brand":"WSD","prices":{"rawPrice":"2980.00","price":"GH₵ 2 980","oldPrice":"GH₵ 3 625","discount":"18%"},"rating":{"average":3.5,"totalRatings":8},"url":"/wsd-e142n-290747683.html","isBuyable":true,"categories":["Computing","Laptops","Notebooks"]}],"other":[1]}};';
  const jumia = parseJumia(jumiaPage, 'https://www.jumia.com.gh', 'Jumia Ghana', 'Ghana', 'GHS');
  check('Jumia: the product list is cut out of the page, brackets inside titles included',
    jumia.length === 1 && jumia[0].price?.amount === 2980 && jumia[0].url === 'https://www.jumia.com.gh/wsd-e142n-290747683.html' &&
    jumia[0].rating === 3.5 && jumia[0].reviewsCount === 8 && jumia[0].discountPercent === 18 && jumia[0].listPrice?.amount === 3625 && jumia[0].availability === 'in_stock', jumia);

  const shopify = parseShopifySuggest(
    JSON.stringify({ resources: { results: { products: [{ title: 'Arduino Uno Rev3', price: '24.50', price_min: '24.50', available: true, url: '/products/arduino-uno-rev-3?_pos=1&_psq=arduino', vendor: 'Arduino', body: '<p>The classic board.</p>' }] } } }),
    'https://thepihut.com', 'The Pi Hut', 'GBP'
  );
  check('Shopify: price takes the store\'s currency and the link loses its tracking',
    shopify.length === 1 && shopify[0].price?.currency === 'GBP' && shopify[0].price.amount === 24.5 &&
    shopify[0].url === 'https://thepihut.com/products/arduino-uno-rev-3' && shopify[0].availability === 'in_stock' && shopify[0].snippet === 'The classic board.', shopify);

  const ali = parseAliExpress('<script>window._d={"itemList":{"content":[{"productId":"1005010441693428","title":{"displayTitle":"Arduino UNO R4 WIFI Development Board"},"prices":{"salePrice":{"currencyCode":"GHS","minPrice":392,"formattedPrice":"GHS 392.00"}},"trade":{"tradeDesc":"2 sold"}}]}};</script>');
  check('AliExpress: item, price in its stated currency, and link',
    ali.length === 1 && ali[0].price?.amount === 392 && ali[0].price.currency === 'GHS' && ali[0].url === 'https://www.aliexpress.com/item/1005010441693428.html', ali);

  const amazonPage = '<div role="listitem" data-asin="B0FVLQLMSV" data-index="2" data-component-type="s-search-result" class="x"><h2 aria-label="Sponsored Ad - UNO Q 2GB" class="a"><span>UNO Q</span></h2><span class="a-offscreen">GHS 692.07</span></div>' +
    '<div role="listitem" data-asin="B008GRTSV6" data-index="3" data-component-type="s-search-result" class="x"><h2 aria-label="Uno REV3 [A000066] - ATmega328P" class="a"><span>Uno REV3</span></h2><i aria-label="4.8 out of 5 stars, rating details"></i><a aria-label="10,429 ratings"></a><span class="a-offscreen">GHS 226.62</span><span class="a-price a-text-price" data-a-strike="true"><span class="a-offscreen">GHS 323.75</span></span></div>';
  const amazon = parseAmazon(amazonPage, 'https://www.amazon.com');
  check('Amazon: sponsored cards are dropped; price, rating and a clean link are read',
    amazon.length === 1 && amazon[0].url === 'https://www.amazon.com/dp/B008GRTSV6' && amazon[0].price?.amount === 226.62 &&
    amazon[0].price.currency === 'GHS' && amazon[0].rating === 4.8 && amazon[0].reviewsCount === 10429, amazon);
  check('Amazon: the struck-through list price gives the discount', amazon[0].listPrice?.amount === 323.75 && amazon[0].discountPercent === 30, amazon[0]);
  check('Shopify: no "compare at" price means no discount is claimed', shopify[0].discountPercent === undefined && shopify[0].listPrice === undefined, shopify[0]);

  const adafruit = parseAdafruit('<div><a href="/product/2488" data-pid="2488" data-name="Adafruit METRO 328 - Arduino Compatible" itemprop="name">x</a><meta itemprop="priceCurrency" content="USD"/><meta itemprop="price" content="17.5000"/><meta itemprop="availability" content="https://schema.org/InStock"/></div>');
  check('Adafruit: microdata price, stock and link',
    adafruit.length === 1 && adafruit[0].price?.amountUSD === 17.5 && adafruit[0].availability === 'in_stock' && adafruit[0].url === 'https://www.adafruit.com/product/2488', adafruit);

  const tonaton = parseJiji(
    JSON.stringify({ adverts_list: { adverts: [{ title: 'Hp Laptop Backpack Bag', slug: 'hp-laptop-backpack-bag', guid: 'MfYFNdCg', price_obj: { value: 150 }, region_item_text: 'Greater Accra, Accra Metropolitan' }] } }),
    'https://tonaton.com', 'Tonaton', 'Ghana', 'GHS'
  );
  check('Tonaton: the advert link is built from its slug and id', tonaton.length === 1 && tonaton[0].url === 'https://tonaton.com/a_hp-laptop-backpack-bag-MfYFNdCg.html' && tonaton[0].price?.amount === 150, tonaton);
  check('the same advert on Jiji and Tonaton is listed once', pickStoreListings([{ ...jiji[0] }, { ...jiji[0], store: 'Tonaton', domain: 'tonaton.com', url: 'https://tonaton.com/a_x.html' }], ['arduino', 'uno'], 10).length === 1);

  const noCountry = { city: 'Current Location', stateOrRegion: '', country: '', latitude: 5.556, longitude: -0.197 };
  const forUnknown = storesFor(parseB2BSearchQuery('hp laptop'), noCountry).map((x) => x.id);
  check('with no country name, coordinates in Ghana still bring the Ghanaian stores', forUnknown.includes('jumia-gh') && forUnknown.includes('tonaton') && forUnknown.includes('jiji-gh'), forUnknown);
  const abroad = storesFor(parseB2BSearchQuery('hp laptop'), { ...noCountry, latitude: 51.5, longitude: -0.12 }).map((x) => x.id);
  check('coordinates outside Ghana do not', !abroad.includes('jumia-gh') && abroad.includes('amazon'), abroad);

  const shorter = broaderQueries(['wsd', 'e142n', '14laptop', 'laptop', 'intel', 'n3450', 'new', 'portable']);
  check('a long search falls back to its leading words, then its plain product words', shorter[0] === 'wsd e142n 14laptop' && shorter[1] === 'laptop intel', shorter);
  check('a short search is never broadened', broaderQueries(['arduino', 'uno', 'r3']).length === 0);

  const ghanaLoc = { city: 'Accra', stateOrRegion: '', country: 'Ghana', latitude: 5.5, longitude: -0.2 };
  const forArduino = storesFor(parseB2BSearchQuery('arduino uno r3'), ghanaLoc).map((x) => x.id);
  const forLaptop = storesFor(parseB2BSearchQuery('hp laptop'), ghanaLoc).map((x) => x.id);
  check('a buyer in Ghana is shown Ghanaian stores, not other countries\'', forLaptop.includes('jiji-gh') && forLaptop.includes('jumia-gh') && !forLaptop.includes('jumia-ng'), forLaptop);
  check('maker stores are asked about lab parts only', forArduino.includes('adafruit') && forArduino.includes('pihut') && !forLaptop.includes('adafruit'), { forArduino, forLaptop });
  check('no store source goes through DuckDuckGo', !STORE_SOURCES.some((x) => /duckduckgo/.test(x.endpoint('x'))));

  const mixed = [
    ...jiji,
    { ...jiji[0], rank: 1 },
    { ...jiji[0], title: 'Acrylic case', rank: 2 },
    ...shopify
  ];
  const pickedListings = pickStoreListings(mixed, ['arduino', 'uno'], 10);
  check('listings about something else and repeated adverts are dropped', pickedListings.length === 2 && pickedListings.every((x) => /Arduino Uno/.test(x.title)), pickedListings.map((x) => x.title));

  const target = Buffer.from('https://www.sparkfun.com/arduino-uno-r3.html').toString('base64').replace(/=+$/, '');
  const bing = `<ol id="b_results"><li class="b_algo" data-id><h2><a href="https://www.bing.com/ck/a?!&amp;&amp;p=abc&amp;u=a1${target}&amp;ntb=1" h="ID=SERP">Arduino Uno - R3 - SparkFun</a></h2>
    <div class="b_caption"><p class="b_lineclamp2">Arduino Uno R3 board, $27.60, in stock.</p></div></li>
    <li class="b_algo"><h2><a href="https://www.bing.com/images/search?q=x">Images</a></h2></li></ol>`;
  const bingHits = parseBingResultsHtml(bing);
  check('a /products/ URL is a product page', classifyPage({ url: 'https://store.arduino.cc/products/arduino-uno-rev3', title: 'Arduino Uno Rev3' }) === 'product');
  check('open-web fallback: tracking redirects are decoded', bingHits.length === 1 && bingHits[0].url === 'https://www.sparkfun.com/arduino-uno-r3.html' && bingHits[0].snippet.includes('$27.60'), bingHits);
  check('a how-to title is an article', classifyPage({ url: 'https://x.com/a', title: 'How to use an Arduino Uno' }) === 'article');

  const ghana = { city: 'Accra', stateOrRegion: '', country: 'Ghana', latitude: 5.5, longitude: -0.2 };
  const queries = buildSearchQueries(parseB2BSearchQuery('arduino uno r3'), ghana);
  check('a product search also asks for prices in the buyer\'s country', queries.some((x) => x.includes('Ghana')), queries);
  const supplierQueries = buildSearchQueries(parseB2BSearchQuery('resistor wholesale supplier'), ghana);
  check('a supplier search asks for suppliers, not retail prices', supplierQueries[0].includes('supplier') && supplierQueries[0].startsWith('resistor'), supplierQueries);

  check('"arduino" maps to electronics shops', storeTypesForQuery(parseB2BSearchQuery('arduino uno'))[0]?.label === 'electronics shop');
  check('"laptop" maps to computer shops', storeTypesForQuery(parseB2BSearchQuery('laptop'))[0]?.label === 'computer shop');
  check('an unmappable product asks the map for nothing', storeTypesForQuery(parseB2BSearchQuery('zzqx widget')).length === 0);
}

// ---------------------------------------------------------------------------------
console.log('[6] Alternatives');
{
  const pharmacy = getSimilarProductRecommendations('pharmacy near me');
  check('"pharmacy" does not trigger ARM microcontroller suggestions', !pharmacy.some((r) => /STM32|ESP32/.test(r.name)), pharmacy.map((r) => r.name));

  const esp = getSimilarProductRecommendations('ESP32 development board');
  check('ESP32 search suggests other boards, not itself', esp.length >= 2 && !esp.some((r) => r.suggestedQuery.toLowerCase() === 'esp32 development board'), esp.map((r) => r.name));

  const unknown = getSimilarProductRecommendations('standing desk');
  check('an unknown product gets cheaper-channel searches', unknown.some((r) => r.suggestedQuery === 'refurbished standing desk'), unknown.map((r) => r.suggestedQuery));
}

// ---------------------------------------------------------------------------------
console.log('[7] Ranking the page being viewed');
{
  check('a page title is cut down to the product', queryFromTitle('Apple iPhone 13 128GB Blue (Unlocked) - Free Delivery | Shop') === 'Apple iPhone 13 128GB Blue', queryFromTitle('Apple iPhone 13 128GB Blue (Unlocked) - Free Delivery | Shop'));

  const market = [
    webVendor('a', 'Arduino Uno R3', 'shop-a.com', 12),
    webVendor('b', 'Arduino Uno R3', 'shop-b.com', 14),
    webVendor('c', 'Arduino Uno R3', 'shop-c.com', 15),
    webVendor('d', 'Arduino Uno R3', 'shop-d.com', 16)
  ];
  const judge = (priceUSD?: number) => {
    const page = pageDealToVendor(
      { title: 'Arduino Uno R3', url: 'https://pricey.com/p/uno', domain: 'pricey.com', priceText: priceUSD ? `$${priceUSD}` : 'Price at checkout', priceUSD, listPriceText: '$60.00', listPriceUSD: 60, discountPercent: 25 },
      'Lab Components & Hardware',
      student
    );
    return judgePageDeal(searchAndRankVendors(student, { query: 'arduino uno r3' }, [page, ...market], []));
  };

  // The same page judged on each criterion the buyer can pick.
  const judgeBy = (sortBy: 'price_asc' | 'distance_asc' | 'rating_desc', extra: VendorService[] = []) => {
    const page = pageDealToVendor(
      { title: 'Arduino Uno R3', url: 'https://pricey.com/p/uno', domain: 'pricey.com', priceText: '$15.50', priceUSD: 15.5 },
      'Lab Components & Hardware',
      student
    );
    return judgePageDeal(searchAndRankVendors(student, { query: 'arduino uno r3', sortBy }, [page, ...market, ...extra], []), sortBy);
  };
  const byPrice = judgeBy('price_asc');
  check('by lowest price: only cheaper offers beat the page, cheapest first', !!byPrice && byPrice.criterion === 'price_asc' && byPrice.rank === 4 && byPrice.better.length === 3 && byPrice.better[0].vendor.pricing.baseMonthlyCost === 12 && /cheaper/.test(byPrice.detail), byPrice && { rank: byPrice.rank, detail: byPrice.detail, better: byPrice.better.map((r) => r.vendor.pricing.baseMonthlyCost) });
  const byRating = judgeBy('rating_desc', [webVendor('r', 'Arduino Uno R3', 'rated.com', 30, { rating: 4.8, reviewsCount: 900, ratingKnown: true })]);
  check('by top rated: only a seller with a published rating beats an unrated page', !!byRating && byRating.better.length === 1 && byRating.better[0].vendor.id === 'web-scraped-r' && /no rating/.test(byRating.headline), byRating && { headline: byRating.headline, better: byRating.better.map((r) => r.vendor.id) });
  const local = webVendor('gh', 'Arduino Uno R3', 'shop.com.gh', 40, { location: { city: 'Online', stateOrRegion: 'shop.com.gh', country: 'Ghana', latitude: 0, longitude: 0 }, locationKnown: false });
  const byDistance = judgeBy('distance_asc', [local]);
  check('by nearest: a seller in the buyer\'s country beats a foreign page, a foreign one does not', !!byDistance && byDistance.better.length === 1 && byDistance.better[0].vendor.id === 'web-scraped-gh', byDistance && { detail: byDistance.detail, better: byDistance.better.map((r) => r.vendor.id) });

  const pricey = judge(45);
  check('an overpriced page is told it can be beaten, with the deals that beat it', !!pricey && pricey.rank > 1 && pricey.better.length > 0 && pricey.better.every((r) => r.totalValueScore > pricey.score) && /cheapest of them is (about )?\d+% less/.test(pricey.detail), pricey && { rank: pricey.rank, headline: pricey.headline, detail: pricey.detail });
  check('better deals are listed best first, at most three', !!pricey && pricey.better.length <= 3 && pricey.better.every((r, i, all) => i === 0 || all[i - 1].totalValueScore >= r.totalValueScore));

  const bargain = judge(5);
  check('the best page is told so and shown nothing better', !!bargain && bargain.rank === 1 && bargain.better.length === 0, bargain && { rank: bargain.rank, headline: bargain.headline });

  const blind = judge(undefined);
  check('a page with no price is not given a price verdict', !!blind && (blind.better.length === 0 || /no price/i.test(blind.headline)), blind && blind.headline);
  check('nothing is judged before the page is ranked', judgePageDeal([]) === undefined);

  const before = toUSD(1000, 'GHS');
  applyRates({ USD: 1, GHS: 10, BAD: -3 }, Date.now());
  check('live rates replace the reference rate', toUSD(1000, 'GHS') === 100 && before !== 100 && ratesStatus().live === true, { before, after: toUSD(1000, 'GHS') });
  check('display amounts follow the live rate too', formatCurrencyAmount(100, 'GHS') === 'GH₵1,000', formatCurrencyAmount(100, 'GHS'));
  check('an implausible rate is ignored', toUSD(5, 'BAD') === undefined);
}

// ---------------------------------------------------------------------------------
console.log('[9] Trips');
{
  const accra = { latitude: 5.65, longitude: -0.19 };
  const today = new Date(2026, 10, 16); // Monday 16 Nov 2026
  const t = (q: string) => parseTrip(q, accra, today);

  const london = t('Accra to London 12 Dec');
  check('"Accra to London 12 Dec" is a flight to LON on 2026-12-12', london?.from.iata === 'ACC' && london.to.iata === 'LON' && london.date === '2026-12-12' && london.mode === 'flight', london);
  const codes = t('flight acc lhr');
  check('airport codes work, and Heathrow searches all of London', codes?.from.name === 'Accra' && codes.to.iata === 'LON', codes);
  const bus = t('bus to Kumasi friday');
  check('"bus to Kumasi friday": from where the buyer is, by bus, this Friday', bus?.from.name === 'Accra' && bus.fromAssumed && bus.to.name === 'Kumasi' && bus.mode === 'bus' && bus.date === '2026-11-20', bus);
  const legon = t('Legon to Tamale');
  check('a campus name stands for its city', legon?.from.name === 'Accra' && legon.to.name === 'Tamale' && legon.mode === undefined, legon);
  const back = t('accra to dubai 20 dec back 5 jan 2 adults');
  check('a return date and passengers are read', back?.date === '2026-12-20' && back.returnDate === '2027-01-05' && back.passengers === 2, back);
  const month = t('flights to london in march');
  check('a month alone searches the month', month?.date === '2027-03', month);
  for (const q of ['laptop in accra', 'kumasi', 'hp laptop', 'iphone 15', 'phone charger to kumasi', 'cheap flights']) {
    check(`"${q}" is not a trip`, t(q) === undefined, t(q));
  }

  const kumasi = t('accra to kumasi')!;
  const ghana = ghanaRows(kumasi, student.location);
  const vipExec = ghana.find((v) => v.trip?.operator === 'VIP Jeoun' && v.trip.service === 'Executive coach');
  check('Accra–Kumasi shows VIP executive at the published GH₵150, with its source and date', !!vipExec && Math.abs(vipExec.pricing.baseMonthlyCost - toUSD(150, 'GHS')!) < 0.01 && vipExec.trip!.checkedOn === '2026-04-08' && !!vipExec.trip!.sourceUrl, vipExec?.trip);
  check('STC is listed without a made-up fare', ghana.some((v) => v.trip?.operator === 'STC' && v.priceKnown === false && v.trip.priceKind === 'unknown'));
  check('AWA is shown as its lowest advertised fare, not a quote', ghana.some((v) => v.trip?.operator === 'Africa World Airlines' && v.trip.priceKind === 'from'));
  const reverse = ghanaRows(t('kumasi to accra')!, student.location);
  check('published fares work in both directions', reverse.some((v) => v.trip?.operator === 'VIP Jeoun' && v.trip.from === 'Kumasi'));
  check('no bus rows for a flight abroad', ghanaRows(london!, student.location).length === 0);

  const apiRow = apiFareToRow(
    { airline: 'EK', airlineName: 'Emirates', flightNumber: 'EK788', departAt: '2026-12-12T22:30:00+00:00', stops: 1, durationMin: 860, price: 9800, currency: 'GHS', link: 'https://www.aviasales.com/search/ACC1212LON1?marker=x', seenOn: '2026-11-15' },
    london!,
    student.location,
    0
  )!;
  check('a fare seen by travellers becomes a row priced in GHS with its booking link', Math.abs(apiRow.pricing.baseMonthlyCost - toUSD(9800, 'GHS')!) < 0.01 && apiRow.exactOrderUrl!.includes('marker=') && apiRow.trip!.priceKind === 'seen' && apiRow.trip!.stops === 1, apiRow.trip);

  const ranked = searchAndRankVendors(student, { query: 'accra to kumasi' }, [...ghana, ...SEED_VENDORS]);
  check('a trip search ranks the fares (cheapest published fare above the airline)', ranked.findIndex((r) => r.vendor.trip?.service === 'Standard') < ranked.findIndex((r) => r.vendor.trip?.operator === 'Africa World Airlines'), ranked.map((r) => r.vendor.name).slice(0, 6));
  check('fares carry no delivery charge', ranked.filter((r) => r.vendor.trip).every((r) => r.shippingEstimate.estimatedCostUSD === 0), ranked.filter((r) => r.vendor.trip).map((r) => r.shippingEstimate));

  const emirates = getCuratedDeals().filter((d) => d.id === 'deal-emirates-student');
  const withDeal = searchAndRankVendors(student, { query: 'accra to london' }, [apiRow], emirates);
  check('the Emirates student baggage offer attaches to an Emirates fare, without changing its price', withDeal[0]?.activeDeal?.title.includes('10 kg') === true && withDeal[0].totalLandedCost === searchAndRankVendors(student, { query: 'accra to london' }, [apiRow]).at(0)!.totalLandedCost, withDeal[0]?.activeDeal);
}

console.log(`\n[Hunu Search Tests] ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
