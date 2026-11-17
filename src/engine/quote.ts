/**
 * Prices that are not published anywhere: what a seller said at the counter or typed
 * in a chat. The buyer brings the price; these helpers turn it into a row the ranking
 * can score, and build the message that asks a shop for one.
 */
import { GeoLocation, ServiceCategory, VendorService } from './types';
import { pickListingPrice } from './priceParser';
import { toUSD } from './currency';

export interface QuotedPrice {
  amount: number;
  currency: string;
}

/** A number followed by one of these is a spec, not a price: "128 GB", "15 inch". */
const UNIT_AFTER = /^\s?(gb|tb|mb|mah|inch|inches|hz|mp|kg|cm|mm|pcs|pieces|years?|yrs?|months?|weeks?|days?|hrs?|hours?|mins?)\b|^\s?["”%]/i;

/** A bare number, optionally "4.2k", that is not part of a model name ("S23", "i5-1235U"). */
const BARE_NUMBER = /(?<![A-Za-z0-9.,₵$£€-])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\s?k)?(?![A-Za-z0-9])/gi;

/**
 * The price in a seller's message. A stated currency wins ("4,200 cedis", "GHS 4200").
 * Otherwise the largest bare number that is not a spec or a phone number is taken, in
 * `defaultCurrency`: "I can do 4200 last price". Undefined when the message has no price.
 */
export function readQuotedPrice(text: string, defaultCurrency: string): QuotedPrice | undefined {
  const stated = pickListingPrice(text);
  if (stated) return { amount: stated.amount, currency: stated.currency };

  let best: number | undefined;
  BARE_NUMBER.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BARE_NUMBER.exec(text)) !== null) {
    const digits = m[1].replace(/,/g, '');
    // A leading zero or nine digits and more is a phone number.
    if ((digits.length > 1 && digits.startsWith('0')) || digits.length >= 9) continue;
    if (UNIT_AFTER.test(text.slice(m.index + m[0].length))) continue;
    let amount = parseFloat(digits + (m[2] || ''));
    if (m[3]) amount *= 1000;
    if (!(amount >= 10)) continue;
    if (best === undefined || amount > best) best = amount;
  }
  return best === undefined ? undefined : { amount: best, currency: defaultCurrency };
}

export interface ProductQuoteInput {
  product: string;
  amount: number;
  currency: string;
  sellerName: string;
  /** Where the seller is, as the buyer would say it: "Circle", "Madina market". */
  area?: string;
  phone?: string;
  category?: ServiceCategory;
  /** The seller's coordinates when known (a shop from the map), otherwise the buyer's own. */
  location: GeoLocation;
  now?: number;
}

/** A quoted product price as a row the ranking can score. Undefined when the price cannot be converted. */
export function productQuoteToVendor(input: ProductQuoteInput): VendorService | undefined {
  const product = input.product.trim();
  const seller = input.sellerName.trim();
  const area = (input.area || '').trim();
  const phone = (input.phone || '').trim();
  const currency = input.currency.toUpperCase();
  const priceUSD = toUSD(input.amount, currency);
  if (!product || !seller || priceUSD === undefined || !(input.amount > 0)) return undefined;

  const now = input.now ?? Date.now();
  const stated = `${currency} ${input.amount.toLocaleString('en-US')}`;

  return {
    id: `custom-quote-${now}`,
    name: `${product} (quoted by ${seller})`,
    category: input.category || 'General Products & Retail',
    serviceType: 'local_physical',
    targetAudience: ['student', 'business', 'supply_chain'],
    location: {
      city: area || input.location.city,
      stateOrRegion: input.location.stateOrRegion,
      country: input.location.country,
      latitude: input.location.latitude,
      longitude: input.location.longitude,
      serviceRadiusKm: 100
    },
    pricing: {
      baseMonthlyCost: priceUSD,
      pricingModel: 'per_unit',
      currency: 'USD',
      startingTierLabel: `${stated} quoted`,
      contractTerm: 'per_item'
    },
    targetIndustries: ['All'],
    targetHeadcount: ['1-10', '11-50', '51-200', '201-1000', '1000+'],
    complianceCertifications: [],
    // A quote carries no public rating; it is scored as unrated rather than given one.
    rating: 0,
    reviewsCount: 0,
    ratingKnown: false,
    locationKnown: true,
    dataSource: 'quote',
    priceSource: 'quote',
    slaGuarantee: 'No guarantee stated',
    summary: `${seller} quoted you ${stated} for ${product}${area ? ` at ${area}` : ''}.`,
    keyFeatures: ['Price quoted to you directly', 'Buy in person', phone ? `Phone: ${phone}` : ''].filter(Boolean),
    websiteUrl: '',
    hasOfficialWebsite: false,
    phone: phone || undefined,
    quotedProduct: product,
    quotedPrice: { amount: input.amount, currency },
    quotedAt: now,
    seller: { name: seller }
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Past this a quoted price is flagged as possibly out of date. */
export const QUOTE_STALE_DAYS = 30;

/** How old a quote is, in the words shown with its rank. */
export function quoteAgeNote(quotedAt: number, now: number = Date.now()): string {
  const days = Math.max(0, Math.floor((now - quotedAt) / DAY_MS));
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  return days > QUOTE_STALE_DAYS
    ? `Quoted to you ${when}: the price may have changed`
    : `Quoted to you ${when}`;
}

/** How a price another buyer shared is described: who said it, how long ago, and who agreed. */
export function communityNote(reportedAt: number, confirmations: number, now: number = Date.now()): string {
  const days = Math.max(0, Math.floor((now - reportedAt) / DAY_MS));
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  const agreed = confirmations > 0 ? `, confirmed by ${confirmations}` : '';
  return `Reported by a Hunu user ${when}${agreed}`;
}

const DIAL_CODES: Record<string, string> = {
  ghana: '233',
  nigeria: '234',
  kenya: '254',
  'south africa': '27',
  'united kingdom': '44',
  'united states': '1',
  canada: '1',
  togo: '228',
  'côte d\'ivoire': '225',
  'ivory coast': '225',
  'burkina faso': '226'
};

/**
 * A phone number as digits with its country code, the form a wa.me link needs.
 * "024 412 3456" in Ghana becomes "233244123456". Undefined when it cannot be made out.
 */
export function internationalPhone(phone: string, country: string): string | undefined {
  // A map entry can list several numbers; the first is the main one.
  const first = phone.split(/[;/]|\s+or\s+/i)[0].trim();
  const digits = first.replace(/\D/g, '');
  const plausible = (d: string) => (d.length >= 8 && d.length <= 15 ? d : undefined);
  if (!digits) return undefined;
  if (first.startsWith('+')) return plausible(digits);
  if (digits.startsWith('00')) return plausible(digits.slice(2));
  const code = DIAL_CODES[country.trim().toLowerCase()];
  if (!code) return undefined;
  if (digits.startsWith('0')) return plausible(code + digits.slice(1));
  if (digits.startsWith(code) && digits.length >= code.length + 7) return plausible(digits);
  return plausible(code + digits);
}

export interface AskPriceLinks {
  /** Opens a WhatsApp chat with the question already typed. */
  whatsapp?: string;
  /** Dials the shop. */
  tel?: string;
}

/** Ways to ask a shop that publishes no price what it charges for `product`. */
export function askPriceLinks(phone: string | undefined, country: string, product: string): AskPriceLinks {
  if (!phone) return {};
  const number = internationalPhone(phone, country);
  if (!number) return {};
  const item = product.trim();
  const message = item
    ? `Hello, how much is the ${item}? Is it in stock?`
    : 'Hello, I would like to ask about a price.';
  return {
    whatsapp: `https://wa.me/${number}?text=${encodeURIComponent(message)}`,
    tel: `tel:+${number}`
  };
}
