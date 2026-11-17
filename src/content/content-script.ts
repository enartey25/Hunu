import { getCompanyProfile } from '../storage/companyStore';
import { searchAndRankVendors } from '../engine/searchEngine';
import { parseB2BSearchQuery } from '../engine/queryParser';
import { searchLiveWebDeals } from '../engine/liveWebDealFinder';
import { SEED_VENDORS } from '../engine/vendorDatabase';
import { extractDealFromPage } from './pageDealExtractor';
import { formatCurrencyAmount, loadLiveRates, SupportedCurrency } from '../engine/currency';

// Register message listener to provide active page deal to Popup and Sidepanel
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'HUNU_EXTRACT_PAGE_DEAL') {
      // The day's exchange rates first, so a cedi price converts at today's rate.
      loadLiveRates()
        .catch(() => false)
        .then(() => sendResponse(extractDealFromPage()));
      return true;
    }
  });
}

const esc = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'
  );

(async function initHunuContentScript() {
  const currentUrl = new URL(window.location.href);
  let detectedQuery = '';
  let isPricingOrDealPage = false;
  const isSearchEngine =
    currentUrl.hostname.includes('google.') || currentUrl.hostname.includes('bing.');

  if (isSearchEngine) {
    detectedQuery = currentUrl.searchParams.get('q') || '';
  } else if (currentUrl.hostname.includes('g2.com') || currentUrl.hostname.includes('capterra.com')) {
    detectedQuery = currentUrl.searchParams.get('query') || currentUrl.searchParams.get('q') || '';
  } else if (
    currentUrl.pathname.includes('/pricing') ||
    currentUrl.pathname.includes('/plans') ||
    currentUrl.pathname.includes('/quote') ||
    currentUrl.pathname.includes('/product') ||
    currentUrl.pathname.includes('/item') ||
    currentUrl.pathname.includes('/deal') ||
    document.querySelector('[class*="price"], [id*="price"]') !== null
  ) {
    isPricingOrDealPage = true;
    const pageDeal = extractDealFromPage();
    detectedQuery = pageDeal.title || currentUrl.hostname.replace('www.', '').split('.')[0];
  }

  const profile = await getCompanyProfile();

  if (isSearchEngine) {
    decorateSearchResults(profile);
  }

  if (!detectedQuery) return;

  const parsed = parseB2BSearchQuery(detectedQuery);
  if (!isPricingOrDealPage && !parsed.category && parsed.detectedKeywords.length === 0) {
    return;
  }

  // Curated deals only: a content script runs under the page's origin and cannot query
  // the search engine. The side panel does the live search when the user opens it.
  const liveDeals = await searchLiveWebDeals(detectedQuery, undefined, { live: false });
  const rankedResults = searchAndRankVendors(profile, { query: detectedQuery }, undefined, liveDeals);
  if (rankedResults.length === 0 && !isPricingOrDealPage) return;

  const topPick = rankedResults[0] || null;
  const pageDeal = isPricingOrDealPage ? extractDealFromPage() : null;

  // Create isolated Shadow DOM host container
  const hostId = 'hunu-b2b-smart-overlay-host';
  if (document.getElementById(hostId)) return;

  const hostElement = document.createElement('div');
  hostElement.id = hostId;
  hostElement.style.position = 'fixed';
  hostElement.style.bottom = '24px';
  hostElement.style.right = '24px';
  hostElement.style.zIndex = '2147483647';
  hostElement.style.fontFamily = '"Hunu Hind", Hind, "Segoe UI", system-ui, sans-serif';

  // Hind has to be registered on the document: a face declared inside the shadow root does not load.
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL && typeof FontFace !== 'undefined') {
      for (const weight of ['400', '600', '700']) {
        const face = new FontFace(
          'Hunu Hind',
          `url(${chrome.runtime.getURL(`fonts/hind-latin-${weight}-normal.woff2`)}) format('woff2')`,
          { weight, style: 'normal', display: 'swap' }
        );
        document.fonts.add(face);
        face.load().catch(() => {});
      }
    }
  } catch {
    // The system face stays as the fallback
  }

  const shadow = hostElement.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .hunu-pill-card {
      background: #ffffff;
      color: #111111;
      border: 2px solid #111111;
      border-radius: 4px;
      width: 360px;
      overflow: hidden;
      box-shadow: 0 18px 40px -12px rgba(17,17,17,0.5);
      font-family: "Hunu Hind", Hind, "Segoe UI", system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.35;
      font-variant-numeric: tabular-nums;
      cursor: default;
    }
    .hunu-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #ffd100;
      border-bottom: 2px solid #111111;
      padding: 8px 8px 8px 14px;
    }
    .hunu-brand { display: flex; align-items: baseline; gap: 8px; font-size: 13px; font-weight: 600; }
    .hunu-brand-badge { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
    .hunu-close {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      background: transparent;
      border: 2px solid #111111;
      border-radius: 4px;
      color: #111111;
      cursor: pointer;
    }
    .hunu-close:hover { background: #111111; color: #ffd100; }
    .hunu-close:focus-visible, .hunu-btn:focus-visible { outline: 3px solid #1558c9; outline-offset: 2px; }
    .hunu-body { padding: 12px 14px 14px; }
    .hunu-title {
      font-weight: 600;
      font-size: 16px;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .hunu-meta { color: #55534c; font-size: 13px; margin: 2px 0 10px; }
    .hunu-page-deal-box { border-top: 1px solid #d5d1c5; padding: 8px 0; font-size: 13px; }
    .hunu-page-deal-box strong { font-weight: 700; }
    .hunu-page-deal-name { font-weight: 600; }
    .hunu-page-deal-price { color: #55534c; margin-top: 2px; }
    .hunu-page-deal-price strong { color: #111111; }
    .hunu-metrics {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      background: #111111;
      color: #ffffff;
      padding: 10px 12px;
      border-radius: 4px;
      margin-bottom: 12px;
    }
    .hunu-metric-label { font-size: 12px; color: #d8d5cc; }
    .hunu-metric-val { font-size: 16px; font-weight: 700; }
    .hunu-metrics > div:first-child { min-width: 0; }
    .hunu-metrics > div:first-child .hunu-metric-val { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hunu-metrics > div:last-child .hunu-metric-val { color: #ffd100; }
    .hunu-btn-row { display: flex; gap: 8px; }
    .hunu-btn {
      flex: 1;
      background: #111111;
      color: #ffffff;
      border: 2px solid #111111;
      border-radius: 4px;
      padding: 7px 10px;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .hunu-btn:hover { background: #2b2a27; }
    .hunu-btn-sec { background: #ffffff; color: #111111; }
    .hunu-btn-sec:hover { background: #ffd100; }
    @media (prefers-reduced-motion: no-preference) {
      .hunu-pill-card { animation: hunu-rise 0.28s cubic-bezier(0.16, 1, 0.3, 1); }
    }
    @keyframes hunu-rise { from { transform: translateY(10px); opacity: 0; } to { transform: none; opacity: 1; } }
  `;

  const container = document.createElement('div');
  container.className = 'hunu-pill-card';

  const currency: SupportedCurrency = profile.location.country.toLowerCase().includes('ghana') ? 'GHS' : 'USD';
  const bestLanded = topPick ? topPick.totalLandedCost ?? topPick.roiEstimate.annualCostEst : null;
  const bestHasPrice =
    !!topPick && topPick.vendor.priceKnown !== false && topPick.vendor.pricing.baseMonthlyCost > 0;
  const pageWins =
    !!pageDeal && !!pageDeal.priceUSD && bestHasPrice && bestLanded !== null && pageDeal.priceUSD <= bestLanded;

  const subtitleContext = pageWins
    ? `The price on this page is lower than the best other deal Hunu found. Compare shipping to ${esc(profile.location.city)} before you buy.`
    : isPricingOrDealPage
    ? `Deal found on this page. See how it ranks against other offers near ${esc(profile.location.city)}.`
    : `Best value for where you are, ${esc(profile.location.city)}.`;

  const topPickBlock = topPick
    ? `
    <div class="hunu-metrics">
      <div>
        <div class="hunu-metric-label">${pageDeal ? 'Best other deal' : 'Best deal found'}</div>
        <div class="hunu-metric-val">${esc(topPick.vendor.name)}</div>
      </div>
      <div>
        <div class="hunu-metric-label">With shipping</div>
        <div class="hunu-metric-val">${bestHasPrice && bestLanded !== null ? esc(formatCurrencyAmount(bestLanded, currency)) : 'Price on site'}</div>
      </div>
    </div>
  `
    : '';

  const pageOfferBlock = pageDeal
    ? `
    <div class="hunu-page-deal-box">
      
      <div class="hunu-page-deal-price">Price on this page: <strong>${esc(pageDeal.priceText)}</strong>${pageDeal.priceUSD && currency !== 'USD' ? `, about <strong>${esc(formatCurrencyAmount(pageDeal.priceUSD, currency))}</strong>` : ''}</div>
    </div>
  `
    : '';

  container.innerHTML = `
    <div class="hunu-header">
      <div class="hunu-brand">
        <span class="hunu-brand-badge">Hunu</span>
        <span>${isPricingOrDealPage ? 'Deal on this page' : 'Best deal nearby'}</span>
      </div>
      <button class="hunu-close" id="hunu-close-btn" aria-label="Close Hunu">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <div class="hunu-body">
      <div class="hunu-title">${esc(pageDeal ? pageDeal.title : topPick?.vendor.name)}</div>
      <div class="hunu-meta">${subtitleContext}</div>
      ${pageOfferBlock}
      ${topPickBlock}
      <div class="hunu-btn-row">
        <button class="hunu-btn" id="hunu-benchmark-btn">Rank and compare <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
        <button class="hunu-btn hunu-btn-sec" id="hunu-open-sidepanel">Open side panel</button>
      </div>
    </div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(container);
  document.body.appendChild(hostElement);

  shadow.getElementById('hunu-close-btn')?.addEventListener('click', () => {
    hostElement.remove();
  });

  const openPanelAndCompare = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'HUNU_OPEN_SIDEPANEL_COMPARE',
        deal: pageDeal
      });
    }
  };

  shadow.getElementById('hunu-benchmark-btn')?.addEventListener('click', openPanelAndCompare);
  shadow.getElementById('hunu-open-sidepanel')?.addEventListener('click', openPanelAndCompare);
})();

function decorateSearchResults(profile: any) {
  const resultLinks = document.querySelectorAll('a h3, div.g a, li.b_algo h2 a');
  resultLinks.forEach((linkEl) => {
    const parentA = linkEl.closest('a');
    if (!parentA || parentA.dataset.hunuDecorated) return;

    try {
      const hrefUrl = new URL(parentA.href);
      const domain = hrefUrl.hostname.replace('www.', '');

      const matchedVendor = SEED_VENDORS.find((v) => {
        try {
          return new URL(v.websiteUrl).hostname.replace('www.', '') === domain;
        } catch {
          return false;
        }
      });

      if (matchedVendor) {
        parentA.dataset.hunuDecorated = 'true';
        const badge = document.createElement('span');
        badge.style.display = 'inline-block';
        badge.style.marginLeft = '8px';
        badge.style.padding = '2px 6px';
        badge.style.fontSize = '12px';
        badge.style.fontWeight = '600';
        badge.style.fontFamily = '"Hunu Hind", Hind, "Segoe UI", system-ui, sans-serif';
        badge.style.backgroundColor = '#ffd100';
        badge.style.color = '#111111';
        badge.style.borderRadius = '3px';
        badge.style.verticalAlign = 'middle';
        badge.textContent = `Hunu: top value (${matchedVendor.category})`;
        linkEl.appendChild(badge);
      }
    } catch {
      // Ignore URL parse failures
    }
  });
}
