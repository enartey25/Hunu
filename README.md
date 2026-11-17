# Hunu — B2B, Supply Chain & Student Value Sourcing Engine

Hunu is an enterprise-grade and academic browser extension (Manifest V3) engineered to source, evaluate, and rank:
1. **Student Deals & Academic Lab Sourcing**: Verified student flights, campus food savings, academic software packs (GitHub, Notion, JetBrains), and electronic components for lab work (microcontrollers, PCBs, semiconductors via DigiKey, Mouser, JLCPCB, Adafruit).
2. **B2B & Supply Chain Procurement**: Ocean/air bulk freight, 3PL warehousing, corporate legal, accounting, cloud infrastructure, and HR services.

---

## 1. Core Architecture & Location Resolution

Hunu resolves your **actual physical location** using real-time IP network intelligence and browser GPS:
- Automatically detects your physical city, region, country, and institution (e.g. `Accra, Ghana • University of Ghana`).
- Calculates true geodesic distance to providers using the Haversine formula.
- Physical services (campus dining, local warehousing, lab dispatch) require close proximity, while global cloud and international freight prioritize data compliance and international shipping routes.

---

## 2. Multi-Mode Sourcing Tabs

1. **Student Deals & Labs**:
   - **Lab Components & Hardware**: DigiKey Academic (15% discount), Mouser Electronics, JLCPCB ($2 custom PCBs + SMT assembly for capstone projects), Adafruit & SparkFun.
   - **Student Flights & Travel**: StudentUniverse (up to 30% off commercial flights), Qatar Airways Student Club (20% off + 10kg free baggage allowance), Skyscanner Youth.
   - **Student Software**: GitHub Student Developer Pack ($200k+ in free tools), Notion Plus 100% free, Figma Professional free, JetBrains All Products.
   - **Food & Campus Dining**: DoorDash DashPass Student ($4.99/mo + $0 delivery fees), Too Good To Go (70% off local meals and groceries nearby).
2. **B2B Services & Supply Chain**:
   - **Supply Chain & Bulk Freight**: Flexport container shipping, air cargo, and customs clearance; ShipBob 3PL warehousing.
   - **Corporate SaaS**: Rippling unified HR, Pilot CPA tax & bookkeeping, Cloudflare edge infrastructure, Cooley legal counsel.

---

## 3. Search and Ranking Engine

Everything runs in the extension; there is no server. The engine lives in `src/engine/`.

### How a search runs

1. **Understand the query** (`queryParser.ts`). Whole-word matching, so "chromebook" is not an HR search. Extracts the product (`arduino uno r3`), a budget (`under $30`, `below 500 cedis`), a quantity, a place (`near Legon`) and the intent: product, service, deal, supplier, local, alternative.
2. **Fetch live sources in parallel** (`liveSearch.ts`), each failing independently:
   - **Store listings** (`storeSources.ts`, `liveWebScraper.ts`): each store is asked through its own search and answers with its own listings, so the price and the link come from the store, not from a search snippet. Up to three listings per store are kept, and only those whose title matches the product.

     | Store | Asked when | How | Prices in |
     |---|---|---|---|
     | [Jiji Ghana](https://jiji.com.gh), [Tonaton](https://tonaton.com) | buyer is in Ghana | JSON listing API (adverts the two share are listed once) | GHS |
     | [Jumia Ghana](https://www.jumia.com.gh) (also [Nigeria](https://www.jumia.com.ng), [Kenya](https://www.jumia.co.ke)) | buyer is in that country | product JSON in the catalogue page | GHS / NGN / KES |
     | [CompuGhana](https://compughana.com), [Telefonika](https://telefonika.com), [Starlite](https://starlite.com.gh) | buyer is in Ghana | Shopify predictive search | GHS |
     | [AliExpress](https://www.aliexpress.com) | always | item JSON in the search page | buyer's currency |
     | [Amazon](https://www.amazon.com) | always | search result cards | buyer's currency |
     | [Arduino Store](https://store-usa.arduino.cc), [Pimoroni](https://shop.pimoroni.com), [The Pi Hut](https://thepihut.com), [Adafruit](https://www.adafruit.com) | electronics and lab parts | Shopify predictive search; Adafruit microdata | USD / GBP |

     The results header links to each store's own results page for the query. eBay, DigiKey, Mouser, Newegg, LCSC, Melcom and Walmart refuse automated requests and are not sources. Adding another Shopify store is one line in `STORE_SOURCES`.
   - **Similar items**: when a long search (typically a product page's title) finds fewer than four matching listings, the stores are asked again with a shorter form of it, first its leading words and then its plain product words. What that finds is shown as a similar item, and the results header says which shorter search was used.
   - **Open web** (`liveWebScraper.ts`): used only when the stores cannot answer (a service, or fewer than four store listings). Up to two Bing searches fused by reciprocal rank; encyclopedias, forums and tutorials are dropped, and the best pages are read for the offer they publish (schema.org JSON-LD, then Open Graph).
   - **Local stores** (`liveLocalSearcher.ts`): OpenStreetMap, asked for the kinds of store that stock the product within 25 km of the buyer.
   - **Deals** (`liveWebDealFinder.ts`): hand-checked programmes, plus discounts stated on a seller's own page.
3. **Score relevance** (`relevance.ts`): field-weighted match per query word (name counts most), with prefix, typo and related-concept matching. Model numbers weigh extra; accessories ("case for Arduino Uno") are demoted.
4. **Rank** (`searchEngine.ts`, `scoring.ts`).

### Exchange rates

Prices are converted with the day's rates from [open.er-api.com](https://open.er-api.com/v6/latest/USD) (free, no key, updated daily). They are fetched at most twice a day and kept in extension storage, so the popup, side panel and page script agree. If the rates cannot be fetched, the last stored ones are used, then the reference rates in `currency.ts`.

### Discounts

When a store states a previous price (Jumia's old price, Shopify's "compare at" price, Amazon's struck-through list price), the listing carries it and the card shows it struck through with the percentage off. The ranking always uses the price charged now.

### Ranking the page you are on

The always-on content script runs only on search engines and review sites, so on a shop page the reader is injected on demand (`page-extract.ts`, needs the `scripting` permission). If the page cannot be scripted, or the reader finds the product but no price, the extension fetches the page itself and reads the price from its HTML (`readPageDeal.ts`).

"Rank this deal" reads the open page's offer (`pageDealExtractor.ts`): the current price from structured data, Open Graph tags or the visible price, and the previous price from whatever is drawn struck through. The offer is ranked with the store listings for the same product, and a verdict (`pageDeal.ts`) shows its score as a percentage, its place, a one-line judgement and up to three offers that score higher.

### Value Score

$$\text{Value} = \frac{w_p P + w_l L + w_f F + w_q Q}{w_p + w_l + w_f + w_q} \times (0.4 + 0.6 \cdot \text{relevance})$$

- **Price ($P$)**: landed cost against the median of the comparable offers found for the same search (needs at least 3). Catalogue sellers fall back to a category benchmark. Continuous, not banded.
- **Distance ($L$)**: Haversine distance when the seller's location is known. A web shop with no known warehouse claims no distance; it is scored as domestic or foreign from its country domain.
- **Fit ($F$)**: student perks or business fit, from the profile.
- **Quality ($Q$)**: the published rating, pulled toward 4.0 until enough reviews back it, plus review volume and certifications.

### What is never invented

- A listing with no readable price is **price unknown**: neutral price score, a 10% rank penalty, never "free", last under "cheapest".
- A seller with no published rating is **unrated**: neutral quality, no stars shown.
- A discount read off the open web is shown as **unverified** and never changes a computed price.
- A price far below every other offer is flagged as probably a different item rather than rewarded.
- Every result carries `reasons`: the plain-language account of its rank, shown in the card's details.

### Tests

- `npm test`: offline tests for parsing, relevance, ranking and the page parsers.
- `npm run test:live -- "arduino uno r3"`: runs the real sources and prints the ranking with per-source timings.

---

## 2. Extension Surfaces

1. **Popup Window (`popup.html`)**:
   - High-density 440px quick-access window.
   - Instant search with natural language category detection.
   - Compact vendor ranking cards with Value Scores, TCO metrics, and one-click ROI simulation.
2. **Chrome Native Side Panel (`sidepanel.html`)**:
   - Docks alongside any webpage in Chrome or Edge.
   - Detects active browsing context (e.g., if you are browsing a vendor pricing page, Hunu benchmarks it automatically).
   - Side-by-side comparison matrix for up to 3 providers across all commercial and legal criteria.
3. **In-Page Smart Assist (`content.js`)**:
   - Injects a non-intrusive enterprise overlay via an isolated Shadow DOM on Google, Bing, G2, Capterra, and Clutch.
   - Triggers when B2B procurement queries are detected (e.g., *"warehouse storage Chicago"*, *"corporate payroll"*, *"SOC-2 compliance consultant"*).
4. **Background Service Worker (`background.js`)**:
   - Synchronizes company profile across tabs via `chrome.storage.sync`.
   - Adds right-click context menu: *"Analyze B2B Service Value with Hunu"*.

---

## 3. Installation Guide (Chrome / Edge / Brave)

1. Open your Chromium-based browser and navigate to:
   - **Chrome**: `chrome://extensions/`
   - **Brave**: `brave://extensions/`
   - **Edge**: `edge://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click the **Load unpacked** button in the top-left corner.
4. Select the `dist` directory inside this repository:
   ```
   C:\Users\legen\Downloads\Hunu\dist
   ```
5. The **Hunu: B2B Value & Proximity Engine** extension icon will now appear in your browser toolbar. Pin it for quick access.

---

## 4. Local Development & Build Commands

- **Build Extension**:
  ```bash
  npm run build
  ```
  Generates production-ready, minified extension bundles in `./dist`.
- **Development Server (Web Test Harness)**:
  ```bash
  npm run dev
  ```
  Launches a local Vite preview server at `http://localhost:5173/` allowing you to inspect both the popup and sidepanel layouts in a standard browser tab.

---

## 5. Seed Vendor Catalogue

Pre-configured across 8 core B2B categories with realistic commercial pricing, locations, and SLA terms:
- **Accounting & Tax**: Pilot CPA, Kruze Consulting, Benchmark Regional CPA
- **Legal & Compliance**: Cooley Emerging Companies, LegalNode Corporate, Midwest Commercial Legal
- **Payroll & HR**: Rippling Unified Cloud, Gusto Business, Deel Global EOR
- **Cloud & DevOps**: OpsFleet Managed Kubernetes, Cloudflare Enterprise
- **3PL & Warehousing**: ShipBob Fulfillment, Red Stag Heavy Logistics, Empire Freight Drayage
- **Cybersecurity**: Arctic Wolf Managed SOC, Vanta Continuous Compliance
- **B2B Marketing & Sales**: Cognism Lead Intelligence, Directive Performance Agency
- **Facilities & Ops**: JLL Corporate Workspace Ops, Regus Commercial Flex Suites

# Hunu
