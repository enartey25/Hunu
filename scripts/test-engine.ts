import { calculateHaversineDistanceKm } from '../src/engine/distance';
import { scoreVendor } from '../src/engine/scoring';
import { searchAndRankVendors } from '../src/engine/searchEngine';
import { parseB2BSearchQuery } from '../src/engine/queryParser';
import { SEED_VENDORS } from '../src/engine/vendorDatabase';
import { CompanyProfile } from '../src/engine/types';
import { resolveVendorSearchUrl, isInvalidOrPlaceholderUrl, resolveOrderDestination } from '../src/engine/urlResolver';
import { getSimilarProductRecommendations } from '../src/engine/similarRecommendations';
import { askPriceLinks, communityNote, internationalPhone, productQuoteToVendor, quoteAgeNote, readQuotedPrice } from '../src/engine/quote';
import { communityShopToVendor, reportToVendor } from '../src/engine/communityPrices';
import { isMappable, pinNote, shopPinToVendor } from '../src/engine/shopPins';
import { checkDeviceId, checkQuery, checkReport, checkReportId, checkSellerKey, checkShop } from '../server/src/validate';
import { calculateShippingEstimate } from '../src/engine/shippingCalculator';
import { deliveredText, deliveryNote } from '../src/engine/deliveryText';
import { extractOfferFromHtml, shippingFor } from '../src/engine/priceParser';
import { jijiSeller } from '../src/engine/storeSources';
import { assessTrust, sellerKey } from '../src/engine/trust';
import { VendorService } from '../src/engine/types';
import { affiliateDisclosure, configureAffiliates, withAffiliate } from '../src/engine/affiliate';
import { judgePageDeal } from '../src/engine/pageDeal';

console.log('[Hunu Test Suite] Running algorithmic and scoring verification...');

// 1. Distance Calculation Test
const nyLat = 40.7128, nyLon = -74.006;
const sfLat = 37.7749, sfLon = -122.4194;
const distanceKm = calculateHaversineDistanceKm(nyLat, nyLon, sfLat, sfLon);
console.log(`[Test 1] NYC to SF Distance: ${distanceKm} km`);
if (distanceKm > 4100 && distanceKm < 4200) {
  console.log('  PASS: Haversine distance matches expected geodesic (~4130 km).');
} else {
  console.error(`  FAIL: Distance ${distanceKm} km outside expected range.`);
  process.exit(1);
}

// 2. Query Parser Test
const query1 = 'need urgent corporate tax cpa in Austin';
const parsed1 = parseB2BSearchQuery(query1);
console.log(`[Test 2] Query: "${query1}" -> Category: ${parsed1.category}, Location: ${parsed1.extractedLocation}`);
if (parsed1.category === 'Accounting & Tax' && parsed1.extractedLocation?.toLowerCase() === 'austin') {
  console.log('  PASS: Successfully parsed category and location intent.');
} else {
  console.error('  FAIL: Query parsing mismatch.', parsed1);
  process.exit(1);
}

// 3. Scoring & Dynamic Weighting Test
const testProfile: CompanyProfile = {
  id: 'test-profile',
  userRole: 'business',
  companyName: 'Test Tech Corp',
  industry: 'SaaS / Software',
  headcount: '11-50',
  budgetTier: 'Growth',
  location: {
    city: 'Austin',
    stateOrRegion: 'TX',
    country: 'United States',
    latitude: 30.2672,
    longitude: -97.7431,
    maxPreferredDistanceKm: 0
  },
  priorityWeights: {
    priceWeight: 0.70, // Heavy price priority
    locationWeight: 0.10,
    fitWeight: 0.10,
    qualityWeight: 0.10
  },
  preferredContract: 'any'
};

const scoredVendors = searchAndRankVendors(testProfile, { category: 'Payroll & HR' });
console.log(`[Test 3] Ranked ${scoredVendors.length} Payroll & HR vendors under 70% price weight:`);
for (const v of scoredVendors) {
  console.log(`  - #${v.vendor.name}: Value Score ${v.totalValueScore}/100, Est. Annual TCO: $${v.roiEstimate.annualCostEst}`);
}

if (scoredVendors.length > 0 && scoredVendors[0].totalValueScore >= 70) {
  console.log('  PASS: Value score calculation conforms to mathematical constraints.');
} else {
  console.error('  FAIL: Scoring did not produce expected results.');
  process.exit(1);
}

// 4. Live Deal Discount Adjustment Test
const rippling = SEED_VENDORS.find(v => v.id === 'rippling-allinone')!;
const standardScore = scoreVendor(rippling, testProfile);
const dealScore = scoreVendor(rippling, testProfile, {
  title: '30% Off Promotion',
  description: 'First year promotion',
  discountPercent: 30,
  claimUrl: 'https://www.rippling.com',
  source: 'Live Web'
});

console.log(`[Test 4] Standard Annual TCO: $${standardScore.roiEstimate.annualCostEst} (Score: ${standardScore.totalValueScore})`);
console.log(`[Test 4] Deal Annual TCO: $${dealScore.roiEstimate.annualCostEst} (Score: ${dealScore.totalValueScore})`);

if (dealScore.roiEstimate.annualCostEst < standardScore.roiEstimate.annualCostEst && dealScore.totalValueScore >= standardScore.totalValueScore) {
  console.log('  PASS: Web deals successfully reduce TCO and boost Value-for-Money Score.');
} else {
  console.error('  FAIL: Deal application did not properly adjust metrics.');
  process.exit(1);
}

// 5. Shipping Estimate & Total Landed Cost Test
const digikey = SEED_VENDORS.find(v => v.id === 'digikey-academic')!;
const digikeyScored = scoreVendor(digikey, {
  ...testProfile,
  userRole: 'student',
  location: {
    city: 'Accra',
    stateOrRegion: 'Greater Accra',
    country: 'Ghana',
    latitude: 5.556,
    longitude: -0.197,
    maxPreferredDistanceKm: 0
  }
});

console.log(`[Test 5] DigiKey to Accra Shipping: $${digikeyScored.shippingEstimate.estimatedCostUSD} via ${digikeyScored.shippingEstimate.courierName}`);
console.log(`[Test 5] DigiKey Total Landed Cost: $${digikeyScored.totalLandedCost}`);

if (digikeyScored.shippingEstimate.estimatedCostUSD > 0 && digikeyScored.totalLandedCost > digikeyScored.roiEstimate.annualCostEst) {
  console.log('  PASS: Shipping costs accurately calculated and integrated into Total Landed Cost.');
} else {
  console.error('  FAIL: Shipping integration failed.');
  process.exit(1);
}

// 6. Working Link Verification & Search Query Deep Linking Test
console.log('[Test 6] Verifying link validity and targeted search page deep linking...');
for (const v of SEED_VENDORS) {
  if (isInvalidOrPlaceholderUrl(v.websiteUrl)) {
    console.error(`  FAIL: Vendor ${v.name} has placeholder/invalid URL: ${v.websiteUrl}`);
    process.exit(1);
  }
}
console.log(`  PASS: All ${SEED_VENDORS.length} seed vendors have valid, non-placeholder URLs.`);

// Test deep link routing for specific search query: "Arduino"
const digikeyArduinoUrl = resolveVendorSearchUrl(digikey, 'Arduino');
console.log(`[Test 6] DigiKey "Arduino" Search URL: ${digikeyArduinoUrl}`);
if (!digikeyArduinoUrl.includes('keywords=Arduino')) {
  console.error('  FAIL: DigiKey search URL did not deep link to Arduino.');
  process.exit(1);
}

const adafruit = SEED_VENDORS.find(v => v.id === 'adafruit-sparkfun-kits')!;
const adafruitArduinoUrl = resolveVendorSearchUrl(adafruit, 'Arduino');
console.log(`[Test 6] Adafruit "Arduino" Search URL: ${adafruitArduinoUrl}`);
if (!adafruitArduinoUrl.includes('adafruit.com/search?q=Arduino')) {
  console.error('  FAIL: Adafruit search URL did not deep link to Arduino.');
  process.exit(1);
}
console.log('  PASS: Link deep routing successfully directs queries to specific searched product pages.');

// 7. Strict Query Relevance Test (No Unrelated Cross-Contamination like Too Good To Go or JLCPCB)
console.log('[Test 7] Verifying strict query relevance (Zero unrelated cross-contamination)...');

// Searching "Arduino": Too Good To Go and JLCPCB must NEVER be in results
const arduinoResults = searchAndRankVendors(testProfile, { query: 'Arduino' }, SEED_VENDORS);
const hasTooGoodInArduino = arduinoResults.some(r => r.vendor.id.includes('too-good') || r.vendor.name.toLowerCase().includes('too good'));
const hasJlcpInArduino = arduinoResults.some(r => r.vendor.id.includes('jlcpcb'));

if (hasTooGoodInArduino || hasJlcpInArduino) {
  console.error('  FAIL: Unrelated vendors appeared in "Arduino" search!', {
    tooGood: hasTooGoodInArduino,
    jlcpcb: hasJlcpInArduino
  });
  process.exit(1);
}
console.log('  PASS: "Arduino" search strictly excludes unrelated vendors ("Too Good To Go" and "JLCPCB").');

// Searching "flights to London": Too Good To Go and JLCPCB must NEVER be in results
const flightResults = searchAndRankVendors(testProfile, { query: 'flights to London' }, SEED_VENDORS);
const hasTooGoodInFlights = flightResults.some(r => r.vendor.id.includes('too-good'));
const hasJlcpInFlights = flightResults.some(r => r.vendor.id.includes('jlcpcb'));

if (hasTooGoodInFlights || hasJlcpInFlights) {
  console.error('  FAIL: Unrelated vendors appeared in "flights" search!');
  process.exit(1);
}
console.log('  PASS: "flights" search strictly excludes "Too Good To Go" and "JLCPCB".');

// Searching "custom PCB fabrication": JLCPCB matches, but Too Good To Go must NOT
const pcbResults = searchAndRankVendors(testProfile, { query: 'custom PCB fabrication' }, SEED_VENDORS);
const hasJlcpInPcb = pcbResults.some(r => r.vendor.id.includes('jlcpcb'));
const hasTooGoodInPcb = pcbResults.some(r => r.vendor.id.includes('too-good'));

if (!hasJlcpInPcb || hasTooGoodInPcb) {
  console.error('  FAIL: PCB search relevance mismatch.');
  process.exit(1);
}
console.log('  PASS: "custom PCB" search accurately includes JLCPCB while excluding "Too Good To Go".');

// 8. Exact Ordering Destination & Physical Counter Fallback Test
console.log('[Test 8] Verifying exact ordering destination & physical counter fallback...');

// A. Physical shop without website: Must have hasWebsite: false and Google search URL
const localPhysicalCounter = {
  id: 'osm-local-accra-parts',
  name: 'Makola Electronics Counter',
  category: 'Lab Components & Hardware' as const,
  serviceType: 'local_physical' as const,
  targetAudience: 'all' as const,
  location: {
    city: 'Accra',
    stateOrRegion: 'Greater Accra',
    country: 'Ghana',
    latitude: 5.55,
    longitude: -0.20
  },
  websiteUrl: '',
  hasOfficialWebsite: false,
  pricing: {
    baseMonthlyCost: 0,
    pricingModel: 'per_unit' as const,
    contractTerm: 'payg' as const,
    startingTierLabel: 'Physical Over-the-Counter'
  },
  keyFeatures: ['Cash on delivery', 'In-person inspection'],
  complianceCertifications: ['Local Retail License'],
  rating: 4.5,
  reviewsCount: 12,
  slaGuarantee: 'Counter Walk-in',
  summary: 'Local street counter selling discrete components.'
};

const physicalDest = resolveOrderDestination(localPhysicalCounter, 'Arduino Uno');
console.log(`[Test 8] Physical Counter Destination URL: ${physicalDest.exactOrderUrl}`);
if (
  !physicalDest.hasWebsite &&
  physicalDest.domainName === 'Google Search' &&
  physicalDest.exactOrderUrl.startsWith('https://www.google.com/search?q=') &&
  physicalDest.actionLabel === 'Search Store on Google'
) {
  console.log('  PASS: Physical shops without websites correctly route to Google search with honest notice.');
} else {
  console.error('  FAIL: Physical shop destination resolution failed.', physicalDest);
  process.exit(1);
}

// B. Online vendor with direct product link
const scrapedProduct = {
  ...localPhysicalCounter,
  id: 'web-scraped-arduino-store',
  name: 'Official Arduino Store',
  websiteUrl: 'https://store.arduino.cc/products/arduino-uno-rev3',
  exactOrderUrl: 'https://store.arduino.cc/products/arduino-uno-rev3',
  hasOfficialWebsite: true
};

const onlineDest = resolveOrderDestination(scrapedProduct, 'Arduino Uno');
console.log(`[Test 8] Scraped Product Direct URL: ${onlineDest.exactOrderUrl}`);
if (
  onlineDest.hasWebsite &&
  onlineDest.exactOrderUrl === 'https://store.arduino.cc/products/arduino-uno-rev3' &&
  onlineDest.domainName === 'store.arduino.cc' &&
  onlineDest.isDirectProductPage
) {
  console.log('  PASS: Direct online store product pages link directly to cart / checkout.');
} else {
  console.error('  FAIL: Direct online store link resolution failed.', onlineDest);
  process.exit(1);
}

// 9. Compatible / Similar Product Recommendations Test
console.log('[Test 9] Verifying genuine compatible / similar product recommendations...');

const arduinoRecs = getSimilarProductRecommendations('Arduino Uno');
console.log(`[Test 9] "Arduino Uno" recommendations (${arduinoRecs.length}):`, arduinoRecs.map(r => r.name).join(', '));
if (
  arduinoRecs.length >= 3 &&
  arduinoRecs.some(r => r.name.includes('ESP32')) &&
  arduinoRecs.some(r => r.name.includes('Raspberry Pi Pico'))
) {
  console.log('  PASS: "Arduino Uno" returns realistic, verified alternatives (ESP32, Pico, Nano).');
} else {
  console.error('  FAIL: Arduino recommendations did not return expected components.');
  process.exit(1);
}

const stm32Recs = getSimilarProductRecommendations('STM32');
console.log(`[Test 9] "STM32" recommendations (${stm32Recs.length}):`, stm32Recs.map(r => r.name).join(', '));
if (
  stm32Recs.length >= 2 &&
  stm32Recs.some(r => r.name.includes('Blue Pill') || r.name.includes('ESP32'))
) {
  console.log('  PASS: "STM32" returns realistic ARM alternatives (Blue Pill, ESP32-S3).');
} else {
  console.error('  FAIL: STM32 recommendations did not match expected.');
  process.exit(1);
}

// 10. Offline quotes: a price a seller quoted, checked against the offers found online
console.log('[Test 10] Verifying offline quote parsing, ranking and verdict...');

function expectEqual(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error(`  FAIL: ${label}. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    process.exit(1);
  }
}

// A. The price in a seller's message
expectEqual('stated cedis', readQuotedPrice('I can do 4,200 cedis last price', 'USD'), { amount: 4200, currency: 'GHS' });
expectEqual('currency code', readQuotedPrice('GHS 3950 for the HP', 'USD'), { amount: 3950, currency: 'GHS' });
expectEqual('bare number', readQuotedPrice('iPhone 13 128GB, I can do 4200 last', 'GHS'), { amount: 4200, currency: 'GHS' });
expectEqual('thousands shorthand', readQuotedPrice('boss 4.2k and it is yours', 'GHS'), { amount: 4200, currency: 'GHS' });
expectEqual('phone number is not a price', readQuotedPrice('call me on 0244123456', 'GHS'), undefined);
expectEqual('no price', readQuotedPrice('it is available, come to the shop', 'GHS'), undefined);
console.log('  PASS: Prices are read from seller messages; specs and phone numbers are not.');

// B. Phone numbers for the "ask the price" link
expectEqual('local Ghana number', internationalPhone('024 412 3456', 'Ghana'), '233244123456');
expectEqual('already international', internationalPhone('+233 30 266 1234; +233 24 000 0000', 'Ghana'), '233302661234');
expectEqual('unknown country', internationalPhone('024 412 3456', 'Atlantis'), undefined);
const askLinks = askPriceLinks('0244123456', 'Ghana', 'hp laptop 15');
if (!askLinks.whatsapp?.startsWith('https://wa.me/233244123456?text=') || !askLinks.whatsapp.includes('hp%20laptop%2015')) {
  console.error('  FAIL: WhatsApp ask link malformed.', askLinks);
  process.exit(1);
}
expectEqual('no phone, no link', askPriceLinks(undefined, 'Ghana', 'hp laptop 15'), {});
console.log('  PASS: Shop numbers become WhatsApp and call links with the product in the message.');

// C. A quote ranked with online offers, and the verdict on it
const accraProfile: CompanyProfile = {
  ...testProfile,
  userRole: 'student',
  location: { city: 'Accra', stateOrRegion: 'Greater Accra', country: 'Ghana', latitude: 5.556, longitude: -0.197, maxPreferredDistanceKm: 0 }
};
const now = Date.now();
const quote = productQuoteToVendor({
  product: 'hp laptop 15',
  amount: 4200,
  currency: 'GHS',
  sellerName: 'Kofi Phones',
  area: 'Circle',
  location: accraProfile.location,
  now
})!;
if (!quote || quote.dataSource !== 'quote' || quote.pricing.contractTerm !== 'per_item' || !(quote.pricing.baseMonthlyCost > 0)) {
  console.error('  FAIL: Quote was not converted to a one-off priced offer.', quote);
  process.exit(1);
}
expectEqual('quote with no price', productQuoteToVendor({ product: 'hp laptop 15', amount: 0, currency: 'GHS', sellerName: 'Kofi', location: accraProfile.location }), undefined);

// Online listings for the same laptop at 80%, 85% and 90% of the quoted price.
const online = [0.8, 0.85, 0.9].map((share, i) => ({
  ...quote,
  id: `web-listing-${i}`,
  name: `HP Laptop 15 Core i5 (store ${i + 1})`,
  dataSource: 'web' as const,
  priceSource: 'page' as const,
  websiteUrl: `https://store${i}.example.com.gh/hp-laptop-15`,
  hasOfficialWebsite: true,
  quotedAt: undefined,
  quotedPrice: undefined,
  quotedProduct: undefined,
  pricing: { ...quote.pricing, baseMonthlyCost: Math.round(quote.pricing.baseMonthlyCost * share * 100) / 100 }
}));
const quoteResults = searchAndRankVendors(accraProfile, { query: 'hp laptop 15', sortBy: 'price_asc' }, [quote, ...online]);
const quoteRow = quoteResults.find((r) => r.vendor.id === quote.id);
if (!quoteRow) {
  console.error('  FAIL: The quote is missing from a search for its own product.');
  process.exit(1);
}
console.log(`[Test 10] Quote landed cost: $${quoteRow.totalLandedCost} (item $${quote.pricing.baseMonthlyCost}), reasons: ${quoteRow.reasons?.join(' | ')}`);
if (!quoteRow.reasons?.includes('Quoted to you today')) {
  console.error('  FAIL: The quote does not say when it was quoted.');
  process.exit(1);
}
const verdict = judgePageDeal(quoteResults, 'price_asc', quote.id, 'quote');
console.log(`[Test 10] Verdict: "${verdict?.headline}" ${verdict?.detail}`);
if (!verdict || verdict.subject !== 'quote' || verdict.better.length !== 3 || verdict.rank !== 4 || /page|checkout/i.test(verdict.headline)) {
  console.error('  FAIL: Verdict on the quote is wrong.', verdict);
  process.exit(1);
}
const bestVerdict = judgePageDeal(
  searchAndRankVendors(accraProfile, { query: 'hp laptop 15', sortBy: 'price_asc' }, [
    { ...quote, pricing: { ...quote.pricing, baseMonthlyCost: quote.pricing.baseMonthlyCost * 0.5 } },
    ...online
  ]),
  'price_asc',
  quote.id,
  'quote'
);
if (!bestVerdict || bestVerdict.rank !== 1 || bestVerdict.better.length !== 0) {
  console.error('  FAIL: A quote below every online price should rank first.', bestVerdict);
  process.exit(1);
}
expectEqual('fresh quote age', quoteAgeNote(now, now), 'Quoted to you today');
expectEqual('stale quote age', quoteAgeNote(now - 45 * 24 * 60 * 60 * 1000, now), 'Quoted to you 45 days ago: the price may have changed');
console.log('  PASS: A quote ranks with online offers, gets its own verdict, and shows its age.');

// 11. Shared prices: what other buyers were quoted, and what the API accepts
console.log('[Test 11] Verifying shared price reports...');

// A. The API's checks on what a client sends
const okReport = checkReport({
  product: '  HP 15 laptop core i5 ',
  amount: '4200',
  currency: 'ghs',
  sellerName: 'Kofi Phones 024 412 3456',
  area: 'Circle <b>',
  latitude: 5.57,
  longitude: -0.21
});
if (!okReport.ok) {
  console.error('  FAIL: A valid report was refused.', okReport);
  process.exit(1);
}
expectEqual('report cleaned', { ...okReport.value, productTokens: undefined }, {
  product: 'HP 15 laptop core i5',
  amount: 4200,
  currency: 'GHS',
  sellerName: 'Kofi Phones',
  area: 'Circle',
  latitude: 5.57,
  longitude: -0.21
});
expectEqual('report tokens match search tokens', okReport.value.productTokens, ['hp', '15', 'laptop', 'core', 'i5']);
expectEqual('no product', checkReport({ amount: 10, currency: 'GHS', sellerName: 'x' }).ok, false);
expectEqual('negative price', checkReport({ product: 'hp laptop', amount: -5, currency: 'GHS', sellerName: 'x' }).ok, false);
expectEqual('bad currency', checkReport({ product: 'hp laptop', amount: 5, currency: 'cedis', sellerName: 'x' }).ok, false);
const halfPlaced = checkReport({ product: 'hp laptop', amount: 5, currency: 'GHS', sellerName: 'x', latitude: 5.5 });
expectEqual('half a coordinate is dropped', halfPlaced.ok && [halfPlaced.value.latitude, halfPlaced.value.longitude], [null, null]);
expectEqual('device id format', [checkDeviceId('short'), checkDeviceId('abcDEF0123456789_-xy')], [undefined, 'abcDEF0123456789_-xy']);
expectEqual('report id format', [checkReportId('12'), checkReportId('1;drop'), checkReportId('-1')], [12, undefined, undefined]);
expectEqual('query needs a product', checkQuery({ q: 'cheap best' }).ok, false);
console.log('  PASS: Reports are trimmed, stripped of phone numbers and markup, and bad input is refused.');

// B. A shared report as a ranked row
const shared = reportToVendor(
  {
    id: 7,
    product: 'hp laptop 15',
    amount: 3900,
    currency: 'GHS',
    sellerName: 'Ama Computers',
    area: 'Circle',
    latitude: 5.57,
    longitude: -0.21,
    reportedAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
    confirmations: 2
  },
  accraProfile.location
)!;
if (!shared || shared.dataSource !== 'community' || shared.priceSource !== 'quote' || shared.id !== 'community-7' || !shared.locationKnown) {
  console.error('  FAIL: Shared report was not turned into a community row.', shared);
  process.exit(1);
}
const sharedResults = searchAndRankVendors(accraProfile, { query: 'hp laptop 15', sortBy: 'price_asc' }, [quote, shared, ...online]);
const sharedRow = sharedResults.find((r) => r.vendor.id === shared.id);
console.log(`[Test 11] Shared row reasons: ${sharedRow?.reasons?.join(' | ')}`);
if (!sharedRow?.reasons?.includes('Reported by a Hunu user 3 days ago, confirmed by 2')) {
  console.error('  FAIL: The shared price does not say who reported it and when.');
  process.exit(1);
}
if (sharedRow.reasons.some((r) => r.startsWith('Quoted to you'))) {
  console.error('  FAIL: A shared price is described as quoted to this buyer.');
  process.exit(1);
}
// The shared price is cheaper than the buyer's own quote, so it is a fourth offer that beats it.
const sharedVerdict = judgePageDeal(sharedResults, 'price_asc', quote.id, 'quote');
if (sharedVerdict?.rank !== 5 || sharedVerdict.total !== 5) {
  console.error('  FAIL: A cheaper shared price does not count against the buyer’s quote.', sharedVerdict);
  process.exit(1);
}
expectEqual('unplaced report sits in the buyer’s city', reportToVendor({ id: 8, product: 'x y', amount: 10, currency: 'GHS', sellerName: 's', area: '', latitude: null, longitude: null, reportedAt: new Date(now).toISOString(), confirmations: 0 }, accraProfile.location)?.locationKnown, false);
expectEqual('no confirmations', communityNote(now, 0, now), 'Reported by a Hunu user today');
console.log('  PASS: Shared prices rank as community rows, say who reported them, and count in the verdict.');

// 12. The map: which rows have a place, pinned shops, and what the API accepts for a pin
console.log('[Test 12] Verifying map pins and pinned shops...');

// A. Only rows with a real place go on the map
const webRow = online[0];
expectEqual('web listing is not mappable', isMappable({ ...webRow, locationKnown: false }), false);
expectEqual('0,0 is not mappable', isMappable({ ...quote, location: { ...quote.location, latitude: 0, longitude: 0 } }), false);
expectEqual('quote is mappable', isMappable(quote), true);
expectEqual('placed shared price is mappable', isMappable(shared), true);

// B. A pinned shop is found by what it sells, and only by that
const pin = shopPinToVendor({
  name: 'Auntie Ama Phones',
  sells: 'laptops, phone repairs, chargers',
  area: 'Makola',
  phone: '024 412 3456',
  latitude: 5.548,
  longitude: -0.21,
  buyer: accraProfile.location,
  pinnedAt: now
})!;
if (!pin || pin.dataSource !== 'pinned' || pin.priceKnown !== false || !isMappable(pin) || pin.relevanceHint !== undefined) {
  console.error('  FAIL: A pinned shop was not turned into an unpriced, mappable row with no relevance floor.', pin);
  process.exit(1);
}
const findsPin = (q: string) => searchAndRankVendors(accraProfile, { query: q }, [pin, ...online]).some((r) => r.vendor.id === pin.id);
expectEqual('found by what it sells', findsPin('laptop'), true);
expectEqual('found by its name', findsPin('auntie ama'), true);
expectEqual('not found for something else', findsPin('rice cooker'), false);
expectEqual('own pin note', pinNote(pin, now), 'Pinned by you today');
expectEqual('no name, no pin', shopPinToVendor({ name: ' ', sells: 'x', latitude: 5.5, longitude: -0.2, buyer: accraProfile.location }), undefined);

// C. A shared pin comes back as a lead for the search that fetched it
const sharedPin = communityShopToVendor(
  { id: 3, name: 'Kofi Stall', sells: 'laptop chargers', area: 'Circle', latitude: 5.57, longitude: -0.21, pinnedAt: new Date(now).toISOString(), confirmations: 1 },
  accraProfile.location
)!;
expectEqual('shared pin id and floor', [sharedPin.id, sharedPin.relevanceHint, sharedPin.communityShop], ['shop-pin-3', 0.45, { id: 3, confirmations: 1 }]);
expectEqual('shared pin note', pinNote(sharedPin, now), 'Pinned by a Hunu user today, confirmed by 1');

// D. The API's checks on a shared pin
const okShop = checkShop({ name: 'Ama <i>Phones</i> 0244123456', sells: 'Laptops & chargers', area: 'Makola', latitude: 5.548, longitude: -0.21 });
if (!okShop.ok) {
  console.error('  FAIL: A valid shop pin was refused.', okShop);
  process.exit(1);
}
expectEqual('shop cleaned', [okShop.value.name, okShop.value.tokens.includes('laptop'), okShop.value.tokens.includes('ama')], ['Ama Phones', true, true]);
expectEqual('shop needs a place', checkShop({ name: 'Ama Phones', sells: 'laptops' }).ok, false);
expectEqual('shop at 0,0 refused', checkShop({ name: 'Ama Phones', sells: 'laptops', latitude: 0, longitude: 0 }).ok, false);
expectEqual('shop needs a name', checkShop({ name: 'x', sells: 'laptops', latitude: 5.5, longitude: -0.2 }).ok, false);
console.log('  PASS: Only placed rows are mapped; pins are found by what they sell; bad pins are refused.');

// 13. Delivery: exact when the seller says, a sourced range when not, never a made-up figure
console.log('[Test 13] Verifying delivery estimates...');
{
  const accra = accraProfile.location;
  const webAt = (url: string, extra: Partial<VendorService> = {}): VendorService => ({
    ...online[0],
    id: `web-${url}`,
    websiteUrl: url,
    exactOrderUrl: url,
    location: { city: 'Online', stateOrRegion: url, country: 'Ghana', latitude: 0, longitude: 0 },
    ...extra
  });
  const est = (v: VendorService) => calculateShippingEstimate(v, undefined, accra);

  expectEqual('walk-in shop is pickup', [est({ ...quote, dataSource: 'local' }).kind, est({ ...quote, dataSource: 'local' }).estimatedCostUSD], ['pickup', 0]);
  const stated = est(webAt('https://shop.example.com.gh/p/1', { delivery: { kind: 'exact', amount: 25, currency: 'GHS', basis: 'Stated on the product page' } }));
  expectEqual('seller-stated fee is exact', [stated.kind, stated.minUSD === stated.maxUSD, stated.basis], ['exact', true, 'Stated on the product page']);
  const jiji = est(webAt('https://jiji.com.gh/a/laptop.html'));
  if (jiji.kind !== 'range' || !(jiji.minUSD! < jiji.maxUSD!) || !jiji.sourceUrl || !/agree the fee/i.test(jiji.condition || '')) {
    console.error('  FAIL: Jiji delivery should be a sourced range with the agree-first advice.', jiji);
    process.exit(1);
  }
  const compu = est(webAt('https://compughana.com/products/hp-15'));
  expectEqual('CompuGhana in Accra is free, with its condition', [compu.kind, compu.estimatedCostUSD, /Accra and Tema/.test(compu.condition || '')], ['free', 0, true]);
  const kumasi = { ...accra, city: 'Kumasi', stateOrRegion: 'Ashanti', latitude: 6.69, longitude: -1.62 };
  expectEqual('CompuGhana outside Accra is unknown', calculateShippingEstimate(webAt('https://compughana.com/products/hp-15'), undefined, kumasi).kind, 'unknown');
  const amazon = est(webAt('https://www.amazon.com/dp/B0', { location: { city: 'Online', stateOrRegion: 'amazon.com', country: 'International', latitude: 0, longitude: 0 } }));
  expectEqual('Amazon to Ghana is unknown, with import charges noted and no figure', [amazon.kind, amazon.minUSD, amazon.importChargesMayApply], ['unknown', undefined, true]);
  const generic = est(webAt('https://gadgets.example.com.gh/p/2'));
  expectEqual('an unknown Ghana shop gets the sourced courier range', [generic.kind, !!generic.sourceUrl], ['range', true]);
  const uk = { ...accra, city: 'London', stateOrRegion: 'England', country: 'United Kingdom' };
  expectEqual('no range is invented outside Ghana', calculateShippingEstimate(webAt('https://shop.example.co.uk/p', { location: { city: 'Online', stateOrRegion: 'x', country: 'United Kingdom', latitude: 0, longitude: 0 } }), undefined, uk).kind, 'unknown');
  for (const e of [stated, jiji, compu, amazon, generic]) {
    if (!e.basis) {
      console.error('  FAIL: A delivery estimate has no basis.', e);
      process.exit(1);
    }
  }

  // The page's own schema.org shippingDetails
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'Product', name: 'HP Laptop 15', offers: { '@type': 'Offer', price: '4200', priceCurrency: 'GHS',
      shippingDetails: [{ shippingRate: { value: '30', currency: 'GHS' }, shippingDestination: { addressCountry: 'GH' }, deliveryTime: { transitTime: { minValue: 1, maxValue: 3 } } },
                        { shippingRate: { value: '90', currency: 'GHS' }, shippingDestination: { addressCountry: 'NG' } }] } })}</script>`;
  const offer = extractOfferFromHtml(html, ['hp', 'laptop', '15']);
  expectEqual('page shipping for Ghana', shippingFor(offer?.shipping, 'Ghana', true), { amount: 30, currency: 'GHS', country: 'GH', transitDays: [1, 3] });
  expectEqual('no Ghana rate from a foreign page with no destination', shippingFor([{ amount: 5, currency: 'USD' }], 'Ghana', false), undefined);

  // How it reads
  const rangedRow = searchAndRankVendors(accraProfile, { query: 'hp laptop 15' }, [webAt('https://jiji.com.gh/a/hp-laptop-15.html', { name: 'HP Laptop 15 (Jiji Ghana)' })])[0];
  if (!rangedRow || !deliveredText(rangedRow, 'GHS').includes('–') || !/estimate/.test(deliveryNote(rangedRow, 'GHS'))) {
    console.error('  FAIL: A ranged delivery is not written as a range.', rangedRow && { total: deliveredText(rangedRow, 'GHS'), note: deliveryNote(rangedRow, 'GHS') });
    process.exit(1);
  }
  console.log(`  e.g. ${deliveredText(rangedRow, 'GHS')} (${deliveryNote(rangedRow, 'GHS')})`);
  console.log('  PASS: Delivery is exact only when stated, ranges carry sources, unknowns carry no figure.');
}

// 14. Trust: product, seller, store and Hunu buyers, with cautions that are never hidden
console.log('[Test 14] Verifying the Trust score...');
{
  expectEqual('Jiji labels become seller signals', jijiSeller({
    user_id: 416286, is_boost: 'diamond',
    labels: [{ type: 'id_verify', value: 'Verified ID' }, { type: 'rating', value: 4.9 }, { type: 'age', value: '5+ years on Jiji' }]
  }), { verifiedId: true, rating: 4.9, yearsActive: 5, paidPlacement: true, platformId: '416286' });

  const jijiAd = (seller?: VendorService['seller'], extra: Partial<VendorService> = {}): VendorService => ({
    ...online[0],
    id: `jiji-${Math.random()}`,
    websiteUrl: 'https://jiji.com.gh/a/hp.html',
    exactOrderUrl: 'https://jiji.com.gh/a/hp.html',
    rating: 0,
    reviewsCount: 0,
    ratingKnown: false,
    seller,
    ...extra
  });
  const good = assessTrust(jijiAd({ rating: 4.9, verifiedId: true, yearsActive: 5, platformId: '1' }));
  const bare = assessTrust(jijiAd());
  console.log(`  verified 5-year seller: ${good.score} ${good.level}; unknown Jiji seller: ${bare.score} ${bare.level}`);
  if (good.score === undefined || bare.score === undefined || good.score <= bare.score) {
    console.error('  FAIL: A verified, long-standing, well-rated seller should out-trust an unknown one.', { good, bare });
    process.exit(1);
  }
  if (!/never pay in advance/i.test(good.advice)) {
    console.error('  FAIL: Classifieds advice is missing.', good.advice);
    process.exit(1);
  }
  const scam = assessTrust(jijiAd({ yearsActive: 0 }), { suspiciouslyCheap: true });
  expectEqual('a too-cheap ad from a new classifieds seller is risky', [scam.level, /too good to be true/i.test(scam.advice)], ['risky', true]);
  const unrated = assessTrust({ ...SEED_VENDORS[0], websiteUrl: 'https://unknown.example', exactOrderUrl: undefined, rating: 0, reviewsCount: 0, ratingKnown: false });
  expectEqual('no evidence is "not enough to go on", not bad', [unrated.level, unrated.score], ['unknown', undefined]);
  const warned = assessTrust({ ...SEED_VENDORS[0], websiteUrl: 'https://unknown.example', rating: 0, reviewsCount: 0, ratingKnown: false }, { suspiciouslyCheap: true });
  expectEqual('a warning is never hidden behind unknown', warned.level, 'caution');
  const liked = assessTrust(jijiAd(undefined), { hunuRatings: { average: 4.8, count: 6 } });
  const disliked = assessTrust(jijiAd(undefined), { hunuRatings: { average: 1.5, count: 6 } });
  if (!(liked.score! > disliked.score!)) {
    console.error('  FAIL: Ratings from Hunu buyers do not move the score.', { liked: liked.score, disliked: disliked.score });
    process.exit(1);
  }
  expectEqual('seller keys', [
    sellerKey(jijiAd({ platformId: '3930573' })),
    sellerKey({ ...quote }),
    sellerKey({ ...quote, id: 'osm-local-99', dataSource: 'local' }),
    sellerKey({ ...online[0], websiteUrl: 'https://www.jumia.com.gh/hp.html', exactOrderUrl: 'https://www.jumia.com.gh/hp.html', seller: undefined })
  ], ['jiji:3930573', 'name:kofi phones|circle', 'osm:99', 'store:jumia.com.gh']);
  expectEqual('server accepts those keys', ['jiji:3930573', 'name:kofi phones|circle', 'osm:99', 'store:jumia.com.gh'].map((k) => checkSellerKey(k) === k), [true, true, true, true]);
  const ranked = searchAndRankVendors(accraProfile, { query: 'hp laptop 15' }, [jijiAd({ rating: 4.9, verifiedId: true, yearsActive: 5, platformId: '7' })], [], new Map([['jiji:7', { average: 5, count: 3 }]]));
  if (!ranked[0]?.trust || !ranked[0].trust.signals.some((s) => s.group === 'hunu users')) {
    console.error('  FAIL: Hunu ratings did not reach the ranked result.', ranked[0]?.trust);
    process.exit(1);
  }
  console.log('  PASS: Trust weighs product, seller, store and Hunu buyers; cautions are never hidden.');
}

// 15. Affiliate links: tagged when configured, never part of the ranking
console.log('[Test 15] Verifying affiliate links...');
{
  const before = searchAndRankVendors(accraProfile, { query: 'hp laptop 15' }, [quote, ...online]).map((r) => `${r.vendor.id}:${r.totalValueScore}`);
  expectEqual('no programmes, no change', [withAffiliate('https://www.amazon.com/dp/B0?th=1'), affiliateDisclosure()], ['https://www.amazon.com/dp/B0?th=1', undefined]);
  configureAffiliates({ 'amazon.com': '?tag=hunu-20', 'aliexpress.com': 'https://s.click.aliexpress.com/deep_link.htm?aff_short_key=K&dl_target_url={url}' });
  expectEqual('Amazon tag appended', withAffiliate('https://www.amazon.com/dp/B0?th=1'), 'https://www.amazon.com/dp/B0?th=1&tag=hunu-20');
  expectEqual('AliExpress wrapped', withAffiliate('https://www.aliexpress.com/item/1.html'), 'https://s.click.aliexpress.com/deep_link.htm?aff_short_key=K&dl_target_url=https%3A%2F%2Fwww.aliexpress.com%2Fitem%2F1.html');
  expectEqual('other stores untouched', withAffiliate('https://compughana.com/products/hp-15'), 'https://compughana.com/products/hp-15');
  expectEqual('disclosure shown', /never changes the ranking/.test(affiliateDisclosure() || ''), true);
  const after = searchAndRankVendors(accraProfile, { query: 'hp laptop 15' }, [quote, ...online]).map((r) => `${r.vendor.id}:${r.totalValueScore}`);
  expectEqual('ranking identical with programmes on', after, before);
  configureAffiliates({});
  console.log('  PASS: Links are tagged only for configured stores, with a disclosure, and the ranking is untouched.');
}

console.log('[Hunu Test Suite] All algorithmic tests passed successfully (15/15).');
