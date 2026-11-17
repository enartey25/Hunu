/**
 * Reads the offer on a browser tab, from the popup or side panel.
 *
 * Three ways, best first:
 *  1. Ask the script already in the page (it sees the page as the buyer does).
 *  2. If no script is there, inject the reader and ask again.
 *  3. Fetch the page ourselves and read its HTML. This also backs up 1 and 2 when
 *     they find the product but not its price.
 */
import { ExtractedPageDeal, extractDealFromPage } from './pageDealExtractor';
import { fetchText } from '../engine/net';
import { loadLiveRates } from '../engine/currency';

const MESSAGE = { type: 'HUNU_EXTRACT_PAGE_DEAL' };

function ask(tabId: number): Promise<ExtractedPageDeal | undefined> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, MESSAGE, (response) => {
        // Reading lastError marks it handled; it is set when no script is listening.
        if (chrome.runtime.lastError || !response?.title) resolve(undefined);
        else resolve(response as ExtractedPageDeal);
      });
    } catch {
      resolve(undefined);
    }
  });
}

async function inject(tabId: number): Promise<boolean> {
  try {
    if (!chrome.scripting?.executeScript) return false;
    await chrome.scripting.executeScript({ target: { tabId }, files: ['page-extract.js'] });
    return true;
  } catch {
    // Browser pages, the web store and file URLs cannot be scripted.
    return false;
  }
}

/** Fetches a page and reads the offer from its HTML, without the page being open. */
export async function crawlPageDeal(url: string): Promise<ExtractedPageDeal | undefined> {
  if (!/^https?:/i.test(url) || typeof DOMParser === 'undefined') return undefined;
  await loadLiveRates().catch(() => false);
  const res = await fetchText(url, { timeoutMs: 7000, maxChars: 2_500_000, cacheTtlMs: 0, headers: { Accept: 'text/html' } });
  if (res.status !== 200 || !res.text) return undefined;
  try {
    return extractDealFromPage(new DOMParser().parseFromString(res.text, 'text/html'), url);
  } catch {
    return undefined;
  }
}

export async function readPageDeal(tab: chrome.tabs.Tab): Promise<ExtractedPageDeal | undefined> {
  const url = tab.url || '';
  if (!tab.id || !/^https?:/i.test(url)) return undefined;

  let deal = await ask(tab.id);
  if (!deal && (await inject(tab.id))) deal = await ask(tab.id);

  if (!deal || deal.priceUSD === undefined) {
    const crawled = await crawlPageDeal(url);
    if (crawled && (!deal || crawled.priceUSD !== undefined)) {
      // Keep what the live page said about itself; take the price the crawl found.
      deal = deal ? { ...deal, ...crawled, title: deal.title, description: deal.description || crawled.description } : crawled;
    }
  }
  if (deal) return deal;

  // Nothing could read the page: at least name it, so it can still be searched for.
  try {
    return {
      title: (tab.title || '').split(/[-|•]/)[0].trim() || 'This page',
      url,
      domain: new URL(url).hostname.replace(/^www\./, ''),
      priceText: 'View on page'
    };
  } catch {
    return undefined;
  }
}
