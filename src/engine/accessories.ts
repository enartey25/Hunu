import { isModelToken, normalizeText, stem } from './text';

/**
 * Telling a product from its accessories.
 *
 * A search for "iphone 15" matches "iPhone 15 Pro Max Case" word for word, and the
 * marketplaces list far more cases, chargers and screen protectors than phones. A
 * listing is an accessory when its own title says what kind of add-on it is and the
 * search did not ask for one:
 *
 * - the add-on word is in the title's lead, not after "with", "+" or "free", where a
 *   seller lists what comes in the box ("HP EliteBook 840 + Charger"), and the title
 *   carries no device specification (RAM, storage, processor), which accessories rarely
 *   do and devices nearly always do;
 * - or the title names the searched product only to say what it fits ("Case for iPhone 15");
 * - or it names a part that is never the device: a logic board, a flash drive.
 *
 * This only applies when the search names a device ("phone", "laptop", "iPhone",
 * "Samsung A54"), so a brand search like "oraimo" or "jbl" still shows the chargers and
 * headphones those brands are known for. When there are prices to go on, they settle
 * it: an "accessory" priced like the devices found is the device ("AirPods Pro 2 with
 * charging case"), and one at a fraction of their price is an accessory.
 */

/** Add-on words, by kind. Multi-word entries match as phrases. */
const ACCESSORY_TERMS: Record<string, string[]> = {
  protection: ['case', 'cover', 'pouch', 'sleeve', 'skin', 'sticker', 'decal', 'bumper', 'holster', 'folio'],
  screen: ['protector', 'tempered glass', 'screen guard', 'privacy screen', 'hydrogel', 'privacy glass'],
  power: ['charger', 'adapter', 'adaptor', 'cable', 'cord', 'power bank', 'powerbank', 'dock', 'docking', 'hub', 'charging pad', 'charging station', 'charging dock'],
  holding: ['stand', 'holder', 'mount', 'tripod', 'selfie stick', 'gimbal', 'grip', 'popsocket', 'cooling pad', 'cooler', 'monitor arm'],
  wearing: ['strap', 'lanyard', 'watch band', 'sport band', 'silicone band', 'leather band', 'replacement band'],
  carrying: ['bag', 'backpack'],
  parts: [
    'repair', 'battery', 'lcd', 'digitizer', 'hinge', 'housing', 'charging port', 'flex cable',
    'back glass', 'cooling fan', 'bezel', 'border', 'palmrest', 'palm rest', 'webcam', 'laptop camera', 'built-in camera',
    'original screen', 'oled screen', 'incell screen', 'lcd screen', 'display screen'
  ],
  spares: ['replacement', 'spare', 'dummy'],
  boards: ['motherboard', 'logic board', 'mainboard'],
  storage: [
    'flash drive', 'pen drive', 'usb drive', 'thumb drive', 'u disk', 'memory stick', 'usb stick', 'memory card',
    'sd card', 'microsd', 'tf card', 'external hard drive'
  ],
  input: ['stylus', 'mouse', 'mousepad', 'mouse pad', 'keyboard', 'remote', 'controller', 'gamepad', 'joystick'],
  supplies: ['ink', 'toner', 'cartridge', 'refill'],
  general: ['accessory', 'accessories'],
  audio: ['earphone', 'earbud', 'earpod', 'headphone', 'headset', 'earpiece', 'handsfree', 'ear pad', 'ear tip', 'airpod', 'bud', 'speaker', 'soundbar']
};

/** Words that name a device people buy accessories for. */
const DEVICE_WORDS = new Set(
  [
    'phone', 'smartphone', 'cellphone', 'iphone', 'android', 'galaxy', 'pixel', 'tecno', 'infinix', 'itel',
    'redmi', 'poco', 'oppo', 'vivo', 'realme', 'nokia', 'oneplus', 'motorola',
    'laptop', 'macbook', 'chromebook', 'thinkpad', 'ideapad', 'thinkbook', 'elitebook', 'probook', 'zbook',
    'pavilion', 'envy', 'spectre', 'omen', 'victus', 'latitude', 'inspiron', 'vostro', 'xps', 'zenbook',
    'vivobook', 'aspire', 'nitro', 'predator', 'surface', 'computer', 'desktop', 'imac',
    'tablet', 'ipad', 'kindle', 'smartwatch', 'watch', 'airpod', 'headphone', 'earbud',
    'console', 'playstation', 'ps4', 'ps5', 'xbox', 'nintendo', 'gopro', 'camera', 'drone',
    'tv', 'television', 'monitor', 'printer', 'arduino', 'raspberry'
  ].map(stem)
);

/** Brands whose name plus a model number ("samsung a54", "hp 250 g8") names a device. */
const DEVICE_BRANDS = new Set([
  'samsung', 'apple', 'hp', 'dell', 'lenovo', 'asus', 'acer', 'msi', 'toshiba', 'tecno', 'infinix', 'itel',
  'xiaomi', 'huawei', 'honor', 'google', 'microsoft', 'oppo', 'vivo', 'realme', 'nokia', 'motorola', 'oneplus'
]);

/**
 * Parts that are never the device. Their titles list storage sizes and the models they
 * fit, so a device specification does not clear them; and an iPhone's logic board can
 * cost as much as a used iPhone, or a replacement AirPods case as much as a clone pair,
 * so neither does the price.
 */
const PART_KINDS = new Set(['spares', 'boards', 'storage']);

/** Audio products: their own words describe them, so they are not add-ons to them. */
const AUDIO_DEVICES = new Set(['airpod', 'headphone', 'earbud', 'earphone', 'headset', 'bud', 'speaker', 'soundbar'].map(stem));

/**
 * Words after which a seller lists what comes in the box. "+" counts only with a space
 * before it, since "S24+" and "8+256GB" are names and specifications. "Plus" and "and"
 * do not count: "iPhone 15 Plus" is a phone and "Black and Gold Case" a case.
 */
const BUNDLE = 'xbundlex';
const BUNDLE_MARKERS = new Set([BUNDLE, 'with', 'w', 'free', 'incl', 'including', 'includes', 'comes', 'bundle', 'bundled']);
const INCLUDED_AFTER = new Set(['included', 'inclusive', 'incl']);

/** An add-on word that, followed by one of these, is part of a device's name. */
const PART_OF_NAME: Record<string, Set<string>> = {
  ink: new Set(['advantage', 'tank', 'efficient', 'jet']),
  case: new Set(['fan']),
  // "1 year replacement warranty" is a promise about the phone.
  replacement: new Set(['warranty', 'guarantee', 'policy', 'plan'])
};

/** "Case for iPhone 15": the product is named only to say what the item fits. */
const FITS_RE = / (?:for|compatible with|fits|to suit|suitable for) (?!sale\b|rent\b)/;

/** Specifications only a device's own listing carries. */
const DEVICE_SPEC_RE = new RegExp(
  [
    String.raw`\b\d{1,2} ?gb ?(?:ram|ddr\d?|lpddr\d?x?)\b`,
    String.raw`\b\d{2,4} ?(?:gb|tb) ?(?:ssd|hdd|emmc|rom|storage|nvme)\b`,
    String.raw`\b\d{1,2} ?gb \d{2,4} ?(?:gb|tb)\b`,
    String.raw`\b\d{1,2} ?\+ ?\d{2,4} ?(?:gb|tb)\b`,
    String.raw`\b(?:16|32|64|128|256|512) ?gb\b`,
    String.raw`\b1 ?tb\b`,
    String.raw`\bcore i[3579]\b`,
    String.raw`\bi[3579][ -]\d{4,5}`,
    String.raw`\bryzen [3579]\b`,
    String.raw`\b(?:celeron|pentium|snapdragon|helio|dimensity|exynos|unisoc)\b`,
    String.raw`\b\d{1,2}(?:th|nd|rd|st) gen\b`,
    String.raw`\bdual sim\b`
  ].join('|')
);

interface Term {
  kind: string;
  words: string[];
}

const TERMS: Term[] = Object.entries(ACCESSORY_TERMS).flatMap(([kind, list]) =>
  list.map((t) => ({ kind, words: t.split(' ').map(stem) }))
);

function words(text: string): string[] {
  return normalizeText(text.replace(/\s\+\s*/g, ` ${BUNDLE} `).replace(/\//g, ' '))
    .split(' ')
    .filter(Boolean)
    .map(stem);
}

/** Add-on terms in `tokens`, with where each starts and how many words it spans. */
function findTerms(tokens: string[]): { kind: string; at: number; length: number }[] {
  const found: { kind: string; at: number; length: number }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    for (const term of TERMS) {
      if (!term.words.every((w, j) => tokens[i + j] === w)) continue;
      const next = tokens[i + term.words.length];
      if (term.words.length === 1 && next && PART_OF_NAME[term.words[0]]?.has(next)) continue;
      found.push({ kind: term.kind, at: i, length: term.words.length });
    }
  }
  return found;
}

/** Where the list of what comes in the box starts, or -1. */
function bundleStart(tokens: string[]): number {
  return tokens.findIndex((t, i) => {
    if (!BUNDLE_MARKERS.has(t)) return false;
    // "65 W charger" is a wattage, not "w/ charger".
    if (t === 'w' && /^\d+$/.test(tokens[i - 1] || '')) return false;
    // "Free delivery" says nothing about what is in the box.
    if (t === 'free' && /^(?:delivery|shipping)$/.test(tokens[i + 1] || '')) return false;
    return true;
  });
}

export interface AccessoryQuery {
  /**
   * True when the search names a device and does not ask for an add-on, so add-on
   * titles are accessories to it.
   */
  active: boolean;
  /** Add-on kinds that count for this search. Audio is the product when the search is for audio. */
  kinds: Set<string>;
  tokens: string[];
}

/** How a search should treat add-on titles. */
export function accessoryQuery(queryTokens: string[]): AccessoryQuery {
  const tokens = queryTokens.flatMap((t) => words(t));
  const kinds = new Set(Object.keys(ACCESSORY_TERMS));
  if (tokens.some((t) => AUDIO_DEVICES.has(t))) kinds.delete('audio');

  const namesDevice =
    tokens.some((t) => DEVICE_WORDS.has(t)) || (tokens.some((t) => DEVICE_BRANDS.has(t)) && tokens.some(isModelToken));
  // "iphone 15 case", "laptop charger": the user wants the add-on. Audio words in an
  // audio search are the product itself, not a request for an add-on.
  const wantsAddOn = findTerms(tokens).some((a) => a.kind !== 'audio');
  return { active: namesDevice && !wantsAddOn, kinds, tokens };
}

/**
 * What a title says about being an add-on to what was searched for, before prices are
 * considered: nothing, an add-on word a price may still overrule ("AirPods Pro 2
 * charging case" priced like AirPods), or a part that is never the device itself.
 */
export type AccessoryEvidence = 'none' | 'addon' | 'part';

/** A title ending in one of these names a part: "A15 Screen", "iPhone 15 Display". */
const HEAD_PARTS = new Set(['screen', 'display']);

export function accessoryEvidence(title: string, query: AccessoryQuery): AccessoryEvidence {
  if (!query.active) return 'none';
  const normalized = ` ${normalizeText(title)} `;
  const tokens = words(title);
  const hasSpec = DEVICE_SPEC_RE.test(normalized);

  // What comes in the box is listed after the device: "HP 250 G8 with bag and charger".
  const cut = bundleStart(tokens);
  const lead = cut >= 0 ? tokens.slice(0, cut) : tokens;
  const terms = findTerms(lead).filter((term) => {
    if (!query.kinds.has(term.kind)) return false;
    if (hasSpec && !PART_KINDS.has(term.kind)) return false;
    const after = lead.slice(term.at + term.length, term.at + term.length + 2);
    if (after.some((t) => INCLUDED_AFTER.has(t))) return false;
    // "5000mAh battery" and "battery life" describe a phone.
    if (lead[term.at] === 'battery') {
      const before = lead[term.at - 1] || '';
      if (/^\d+mah$|^mah$/.test(before) || lead[term.at + 1] === 'life') return false;
    }
    return true;
  });
  if (terms.some((term) => PART_KINDS.has(term.kind))) return 'part';
  if (terms.length > 0) return 'addon';
  if (!hasSpec && tokens.length > 1 && HEAD_PARTS.has(tokens[tokens.length - 1])) return 'addon';

  // "Tempered glass for iPhone 15 Pro Max", "NVMe SSD 1TB for Laptop": nothing searched
  // for comes before "for", and the search is named after it.
  const fits = normalized.search(FITS_RE);
  if (fits > 0) {
    const names = (part: string[]) => query.tokens.some((t) => part.some((w) => w === t || (w.length >= 4 && w.startsWith(t))));
    const before = words(normalized.slice(0, fits));
    if (before.length > 0 && !names(before) && names(words(normalized.slice(fits)))) return 'addon';
  }
  return 'none';
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Fewest priced non-accessory listings before their prices decide. One is enough: a
 * misleading reference price can only make Hunu show an accessory, never hide a device
 * that is priced like the others.
 */
const MIN_DEVICE_PRICES = 1;
/** An add-on title priced at least this share of the devices' median is the device. */
const DEVICE_PRICE_SHARE = 0.5;

export interface AccessoryCandidate {
  title: string;
  /** Item price in USD, when known. */
  priceUSD?: number;
}

/**
 * Marks which of `items` are accessories for this search. Prices of the listings that
 * do not look like add-ons settle the doubtful cases; a part is never the device.
 */
export function markAccessories<T extends AccessoryCandidate>(items: T[], query: AccessoryQuery): boolean[] {
  if (!query.active) return items.map(() => false);
  const evidence = items.map((item) => accessoryEvidence(item.title, query));
  const devicePrices = items
    .filter((item, i) => evidence[i] === 'none' && item.priceUSD !== undefined && item.priceUSD > 0)
    .map((item) => item.priceUSD!);
  const reference = devicePrices.length >= MIN_DEVICE_PRICES ? median(devicePrices) : undefined;

  return items.map((item, i) => {
    if (evidence[i] === 'none') return false;
    if (evidence[i] === 'part') return true;
    if (reference !== undefined && item.priceUSD !== undefined && item.priceUSD > 0) {
      return item.priceUSD < reference * DEVICE_PRICE_SHARE;
    }
    return true;
  });
}
