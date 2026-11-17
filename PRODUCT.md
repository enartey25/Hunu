# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People shopping for a specific product in their browser who want the best deal on it. The owner confirmed students and business buyers as equal audiences. The default detected context in the code is Accra, Ghana / University of Ghana, with GHS as a supported display currency.

## Product Purpose

Hunu is a browser extension that finds the best deals for a product the user searches for and compares them (owner's statement). Success is a user typing a product, seeing the deals ranked, comparing the top ones, and going to the best offer with confidence.

## Positioning

Deals are ranked by a computed Value Score, not by price alone: Price Efficiency, Proximity, Fit, and Quality, anchored to the user's real detected location and to landed cost including shipping. The score is always explained.

## Operating Context

- **Popup** (`popup.html`): 440px wide, max 640px tall. Search a product, see ranked deals, start a comparison.
- **Side panel** (`sidepanel.html`): docks beside any page; detects the offer on the active page and benchmarks it; comparison matrix for up to 3 deals.
- **In-page assist** (`content.js`): Shadow DOM overlay on Google, Bing, G2, Capterra, Clutch.
- **Background worker**: syncs the profile; right-click context menu entry.
- **Modals**: profile and location, ROI calculator, Lab BOM (multi-item) calculator, add a custom quote.

## Capabilities and Constraints

- Natural-language product query with category detection; live web deal search plus a seed catalogue.
- Sort and filter (value, price, distance), distance limit, audience modes.
- Display currencies: USD, GHS, GBP, EUR.
- Compare up to 3 deals; add a custom quote; Lab BOM optimizer; ROI simulation; promo codes; similar-product recommendations when nothing matches.
- Stack: React 19, TypeScript, Tailwind CSS v4, lucide-react, Vite; built to `dist` by `scripts/build.js`.
- Extension constraints: fixed popup width, narrow side panel, Shadow DOM content UI, extension CSP.
- Redesign scope (confirmed): every surface is renovated. Existing functions and engine behavior stay working.
- Open: the README and manifest still describe a "B2B value and proximity engine" with service-vendor categories. The owner's stated plot is product deal finding and comparison; whether the B2B services catalogue stays as a secondary mode is undecided.

## Brand Commitments

- Name: Hunu.
- No visual commitment is binding; the owner asked for everything to be renovated.

## Evidence on Hand

- Seed catalogue and scoring engine in `src/engine/`.
- Icons in `public/icons/`.
- No testimonials, customer logos, usage numbers, or press exist; none may be invented.

## Product Principles

1. The product searched for is the subject; deals are the answer; comparison is the destination.
2. The score must be explainable: every ranking shows what drove it.
3. Landed cost and distance are first-class, never footnotes.
4. Density serves decisions: small surfaces, real numbers, nothing ornamental in the way.
