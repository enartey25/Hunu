# Hunu shared prices API

Buyers who tick **Share this price with other Hunu users** in the quote check send the
product, price, seller name and area here. Searches for that product nearby get it back
as a community price row. No accounts: each install sends a random device id, stored
only as a salted hash, used for rate limits and one-vote-per-device.

## Endpoints

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/reports?q=&lat=&lon=` | Reports matching the product within 60 km, newer than 60 days, with fewer than 2 flags |
| POST | `/reports` | File a report (header `x-hunu-device`). 20 per device and 60 per network address a day |
| POST | `/reports/:id/confirm` | "I was quoted this too". Not on your own report |
| POST | `/reports/:id/flag` | "Wrong price". Two flags hide a report |
| POST | `/reports/live` | The same search, sealed for a Realtime subscription |
| GET | `/shops?q=&lat=&lon=` | Shop pins within 60 km whose name or "sells" words share a word with the search, fewer than 2 flags |
| POST | `/shops` | Share a shop pin (name, what it sells, area, coordinates). 10 per device and 30 per network address a day |
| POST | `/shops/:id/confirm` · `/shops/:id/flag` | "The shop is there" / "Wrong pin". Two flags hide a pin |
| POST | `/sellers/rate` | A Hunu buyer rates a seller 1–5 with an optional note. One rating per device per seller; rating again changes it |
| GET | `/sellers/ratings?keys=` | Average, count and latest notes for up to 40 sellers. Two flags hide a rating |
| POST | `/sellers/ratings/:id/flag` | Report a rating as wrong |
| POST | `/delivery/shopify` | The delivery charge a Shopify store's own checkout gives for an item and region (allowlisted stores only, fresh session per lookup) |
| POST | `/search` | The website's search: runs the extension's engine on the server. Jiji, Tonaton and Jumia refuse cloud servers, so the website sees fewer Ghana listings than the extension |

## Website

```sh
npm run dev:web     # http://localhost:5175/web.html
npm run build:web   # static site in dist-web/, ready for any host
```

## Affiliate links

Set `HUNU_AFFILIATES` in `.env.local` before building, as JSON from store domain to rule:

```
HUNU_AFFILIATES={"amazon.com":"?tag=YOUR-TAG-20","aliexpress.com":"https://s.click.aliexpress.com/deep_link.htm?aff_short_key=YOUR_KEY&dl_target_url={url}"}
```

`?…` appends parameters; a URL with `{url}` wraps the store link. Links change only when shown;
the ranking never sees them, and a disclosure line appears under the results.

## Run locally

```sh
cd server
npm install
npm run migrate   # creates price_reports and report_votes (safe to repeat)
npm run dev       # http://localhost:8787, DATABASE_URL from ../.env.local
```

Then build the extension against it, from the repo root:

```sh
# PowerShell
$env:HUNU_API_URL = "http://localhost:8787"; npm run build
```

Without `HUNU_API_URL` the extension builds with sharing turned off: no checkbox and no
shared-price source, and everything else works as before.

## Deploy

`src/index.ts` exports a standard `fetch` handler (Neon Functions, or any WinterTC host);
`src/node.ts` is a plain Node server (Render, Railway, Fly, a VPS). Both need
`DATABASE_URL` set on the server, and optionally `HUNU_HASH_SALT` (any long random string).
**Never put `DATABASE_URL` in the extension.**

It is deployed as the Neon Function `hunuprices` (declared in `../neon.ts`), on the
Hunu project's `production` branch. From the repo root:

```sh
neon deploy --env .env.local --update-existing   # redeploy after changing server/
npm run test:e2e                                 # share, push, search, confirm, flag, against the live API
cd server && npm run cleanup:e2e                 # remove the test report
```

`.env.local` holds `HUNU_API_URL`, the address the extension is built against.

## Live prices (Neon Realtime)

`POST /reports/live` seals the same search as `GET /reports` and returns it with the
Realtime URL; the extension subscribes and renews it every minute, so shared prices,
confirmations and flags appear without searching again. Realtime's settings reach the
Function as `HUNU_REALTIME_URL` / `HUNU_REALTIME_SECRET` (the `NEON_` prefix is
reserved). Realtime refuses set-returning functions in a SELECT list, so the live query
counts word overlap in a `LATERAL` join; test a changed query with
`neon realtime subscribe --debug "SELECT ..."` first.
