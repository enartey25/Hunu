/**
 * Injected on demand into the page being viewed, on sites where the always-on content
 * script does not run (every shop that is not a search engine). It answers the same
 * "read this page's offer" message, so the popup and side panel ask one question
 * whichever script is present.
 */
import { extractDealFromPage } from './pageDealExtractor';
import { loadLiveRates } from '../engine/currency';

const FLAG = '__hunuPageExtractReady';
const scope = globalThis as unknown as Record<string, unknown>;

if (!scope[FLAG] && typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  scope[FLAG] = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'HUNU_EXTRACT_PAGE_DEAL') return undefined;
    // The day's exchange rates first, so a cedi price converts at today's rate.
    loadLiveRates()
      .catch(() => false)
      .then(() => sendResponse(extractDealFromPage()));
    return true;
  });
}
