/**
 * Affiliate links: Hunu's first way to earn. When a buyer follows "Go to offer" to a
 * store whose affiliate programme Hunu has joined, the link carries Hunu's affiliate
 * tag, and the store may pay a small commission on the sale.
 *
 * This only rewrites the link at the moment it is shown. The ranking never sees it: an
 * offer earns no extra points for paying Hunu, and the buyer is told links may earn.
 *
 * Programmes are configured at build time in HUNU_AFFILIATES, as JSON mapping a store's
 * domain to how its links are tagged:
 *   "?tag=hunu-20"                       append these query parameters (Amazon Associates)
 *   "https://partner.example/c?u={url}"  wrap the link, {url} is the encoded store link
 * With nothing configured, links are left exactly as the stores gave them.
 */

declare const __HUNU_AFFILIATES__: string | undefined;

let programmes: Record<string, string> = {};
try {
  programmes = JSON.parse(typeof __HUNU_AFFILIATES__ === 'string' && __HUNU_AFFILIATES__ ? __HUNU_AFFILIATES__ : '{}');
} catch {
  programmes = {};
}

/** For tests: replace the configured programmes. */
export function configureAffiliates(map: Record<string, string>): void {
  programmes = { ...map };
}

function programmeFor(url: URL): string | undefined {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const key = Object.keys(programmes).find((d) => host === d || host.endsWith(`.${d}`));
  return key ? programmes[key] : undefined;
}

/** The link to show for an offer: tagged when Hunu is in that store's programme, untouched otherwise. */
export function withAffiliate(link: string): string {
  if (!link || Object.keys(programmes).length === 0) return link;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return link;
  }
  const rule = programmeFor(url);
  if (!rule) return link;
  if (rule.startsWith('?')) {
    for (const [k, v] of new URLSearchParams(rule.slice(1))) url.searchParams.set(k, v);
    return url.toString();
  }
  if (/^https:\/\/[^\s]+\{url\}/.test(rule)) return rule.replace('{url}', encodeURIComponent(link));
  return link;
}

/** The line shown near the results when any programme is configured, otherwise undefined. */
export function affiliateDisclosure(): string | undefined {
  return Object.keys(programmes).length > 0
    ? 'Hunu may earn a small commission from some store links. It never changes the ranking.'
    : undefined;
}
