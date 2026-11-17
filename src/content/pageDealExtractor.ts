import { contentTokens } from '../engine/text';
import { extractOfferFromHtml, parsePrices, ParsedPrice } from '../engine/priceParser';

export interface ExtractedPageDeal {
  title: string;
  url: string;
  domain: string;
  priceText?: string;
  priceUSD?: number;
  description?: string;
  currencyDetected?: string;
  /** The page's own previous (struck-through) price, when it shows one above the current price. */
  listPriceText?: string;
  listPriceUSD?: number;
  /** The markdown against that previous price, in percent. */
  discountPercent?: number;
}

/** Where shops put the price being charged now. */
const PRICE_SELECTORS =
  '[itemprop="price"], [data-testid*="price"], .a-price .a-offscreen, [class*="sale-price"], [class*="price--sale"], ' +
  '[class*="current-price"], [class*="price"], [id*="price"]';

/** Where shops put the price they charged before. */
const OLD_PRICE_SELECTORS =
  'del, s, strike, [data-a-strike="true"] .a-offscreen, [class*="old-price"], [class*="oldPrice"], [class*="was-price"], ' +
  '[class*="compare"], [class*="list-price"], [class*="regular-price"], [class*="original-price"], [class*="strike"], [class*="-old"], ' +
  '[data-price-old], [class*="lthr"], [class*="line-through"]';

/** True when the element is drawn struck through, whatever its class is called. */
function isStruckThrough(el: Element): boolean {
  try {
    return getComputedStyle(el).textDecorationLine.includes('line-through');
  } catch {
    return false;
  }
}

/** "GH₵ 3 625" and "1 299,00 €": some shops group thousands with a space. */
function readPrices(text: string, domain: string): ParsedPrice[] {
  // Not after a decimal part: "$19.99 100 sold" is a price and a count, not one number.
  return parsePrices(text.replace(/(?<![.,]\d*)(\d)[\s\u00a0\u202f](?=\d{3}(?!\d))/g, '$1'), domain);
}

/** Short text of an element, or '' when it is a container rather than a price. */
function shortText(el: Element): string {
  const text = ((el as HTMLElement).innerText || el.textContent || '').trim();
  return text.length > 60 ? '' : text;
}

function isOldPriceElement(el: Element): boolean {
  return !!el.closest(OLD_PRICE_SELECTORS) || isStruckThrough(el);
}

function plausible(price: ParsedPrice | undefined): price is ParsedPrice {
  return !!price && price.amountUSD >= 0.05 && price.amountUSD <= 250000;
}

function label(price: ParsedPrice): string {
  return price.currency === 'USD' ? `$${price.amount.toFixed(2)}` : `${price.raw} (~$${price.amountUSD.toFixed(2)})`;
}

/**
 * Reads the offer on the page being viewed: what it is, the price charged now, and,
 * when the page shows one, the previous price it is marked down from.
 *
 * The current price is taken from the most reliable place that has it: the page's
 * structured data, then its Open Graph tags, then the visible price element. A
 * struck-through price is never taken as the current one.
 *
 * Works on the live page (the default) and on a page that was fetched and parsed,
 * where nothing is rendered: there, struck-through prices are found by name only.
 */
export function extractDealFromPage(doc: Document = document, pageUrl: string = window.location.href): ExtractedPageDeal {
  const url = pageUrl;
  let domain = '';
  try {
    domain = new URL(pageUrl).hostname.replace(/^www\./, '');
  } catch {
    domain = '';
  }

  // 1. Title
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
  const h1 = (doc.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim();
  let title = h1 || ogTitle || (doc.title || '').split(/[-|•]/)[0].trim() || 'Current Webpage Offer';
  if (title.length > 70) title = title.substring(0, 67) + '...';

  // 2. Current price: structured data and Open Graph first, then the visible price.
  let price: ParsedPrice | undefined;
  try {
    price = extractOfferFromHtml(doc.documentElement.outerHTML, contentTokens(title))?.price;
  } catch {
    price = undefined;
  }
  if (!plausible(price)) price = undefined;

  if (!price) {
    const statedCurrency = doc.querySelector('[itemprop="priceCurrency"]')?.getAttribute('content')?.toUpperCase();
    for (const el of Array.from(doc.querySelectorAll(PRICE_SELECTORS)).slice(0, 400)) {
      if (isOldPriceElement(el)) continue;
      const text = (el.getAttribute('content') || '').trim() || shortText(el);
      if (!text) continue;
      // A bare number is only a price when the page names its currency beside it.
      const found = readPrices(/^[\d.,]+$/.test(text) ? (statedCurrency ? `${statedCurrency} ${text}` : '') : text, domain)[0];
      if (plausible(found)) {
        price = found;
        break;
      }
    }
  }

  // 3. Previous price: the first struck-through amount in the same currency that is
  // above the current price, and not absurdly so.
  let listPrice: ParsedPrice | undefined;
  if (price) {
    // Elements named as an old price, then anything price-like that is drawn struck through.
    const named = Array.from(doc.querySelectorAll(OLD_PRICE_SELECTORS)).slice(0, 200);
    const struck = Array.from(doc.querySelectorAll(PRICE_SELECTORS + ', span, b, strong, p'))
      .slice(0, 2500)
      .filter((el) => /\d/.test(shortText(el)) && isStruckThrough(el))
      .slice(0, 50);
    for (const el of [...named, ...struck]) {
      const text = shortText(el);
      if (!text) continue;
      const found = readPrices(text, domain).find(
        (p) => p.currency === price!.currency && p.amount > price!.amount && p.amount < price!.amount * 10
      );
      if (found) {
        listPrice = found;
        break;
      }
    }
  }
  const discountPercent = price && listPrice ? Math.round((1 - price.amount / listPrice.amount) * 100) : undefined;

  // 4. Description
  const ogDesc =
    doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
    doc.querySelector('meta[name="description"]')?.getAttribute('content');
  const description = ogDesc?.substring(0, 160) || `Offer detected directly on ${domain}.`;

  return {
    title,
    url,
    domain,
    priceText: price ? label(price) : 'Price at checkout',
    // Left undefined when the page shows no price, so it is ranked as "price unknown".
    priceUSD: price?.amountUSD,
    currencyDetected: price?.currency,
    description,
    ...(listPrice && discountPercent && discountPercent >= 1
      ? { listPriceText: label(listPrice), listPriceUSD: listPrice.amountUSD, discountPercent }
      : {})
  };
}
