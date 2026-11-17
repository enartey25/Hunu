import { VendorService } from './types';
import { LiveWebDeal } from './liveWebDealFinder';

/**
 * Extracts a clean domain hostname from a URL string, returning '' on failure.
 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Checks whether a URL is a dummy placeholder or invalid URL.
 */
export function isInvalidOrPlaceholderUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return true;
  const trimmed = url.trim().toLowerCase();
  if (
    trimmed === '' ||
    trimmed === 'https://' ||
    trimmed === 'http://' ||
    trimmed.includes('example.com') ||
    trimmed.includes('example.org') ||
    trimmed.includes('placeholder')
  ) {
    return true;
  }
  return false;
}

export interface OrderDestination {
  exactOrderUrl: string;
  hasWebsite: boolean;
  domainName: string;
  actionLabel: string;
  isDirectProductPage: boolean;
  notes?: string;
}

/**
 * Resolves the exact destination for a vendor.
 * If the vendor has no website (e.g. local physical shop counter in Accra),
 * returns hasWebsite: false, notes, and a direct Google search query.
 * If the vendor has a website or direct scraped listing, returns the exact ordering URL.
 */
export function resolveOrderDestination(
  vendor: VendorService,
  searchQuery?: string
): OrderDestination {
  const query = (searchQuery || '').trim();
  const vendorId = vendor.id || '';
  const vendorName = vendor.name || 'Store';
  const city = vendor.location?.city || '';
  const country = vendor.location?.country || '';

  // 1. Check if vendor has no website (e.g. local physical street counter, or explicitly flagged)
  const isOsmLocalWithoutSite =
    vendorId.startsWith('osm-local-') &&
    (!vendor.websiteUrl || vendor.websiteUrl.includes('openstreetmap.org'));
  const isInvalid = isInvalidOrPlaceholderUrl(vendor.websiteUrl);
  const lacksOfficialSite = vendor.hasOfficialWebsite === false;

  if (lacksOfficialSite || isOsmLocalWithoutSite || isInvalid) {
    const searchTarget = `${vendorName} ${city} ${country} store`.trim();
    return {
      exactOrderUrl: `https://www.google.com/search?q=${encodeURIComponent(searchTarget)}`,
      hasWebsite: false,
      domainName: 'Google Search',
      actionLabel: 'Search Store on Google',
      isDirectProductPage: false,
      notes: 'No direct online ordering website listed for this local counter. Use Google Search to find contact info or physical branch.'
    };
  }

  // 2. Direct exact order URL if explicitly specified on the vendor
  if (vendor.exactOrderUrl && !isInvalidOrPlaceholderUrl(vendor.exactOrderUrl)) {
    const domain = extractDomain(vendor.exactOrderUrl);
    return {
      exactOrderUrl: vendor.exactOrderUrl,
      hasWebsite: true,
      domainName: domain,
      actionLabel: `Order on ${domain}`,
      isDirectProductPage: true
    };
  }

  // 3. Live web-scraped listings or active webpage deals (already contain the exact product URL)
  if (
    vendorId.startsWith('web-scraped-') ||
    vendorId === 'active-page-deal-item' ||
    vendor.websiteUrl.includes('store.arduino.cc') ||
    vendor.websiteUrl.includes('/collections/') ||
    vendor.websiteUrl.includes('/pages/') ||
    vendor.websiteUrl.includes('/product/') ||
    vendor.websiteUrl.includes('/item/') ||
    vendor.websiteUrl.includes('/dp/')
  ) {
    const domain = extractDomain(vendor.websiteUrl);
    return {
      exactOrderUrl: vendor.websiteUrl,
      hasWebsite: true,
      domainName: domain,
      actionLabel: `Order on ${domain}`,
      isDirectProductPage: true
    };
  }

  // 4. If the URL already has a specific sub-path, keep it directly
  try {
    const parsed = new URL(vendor.websiteUrl);
    if (parsed.pathname && parsed.pathname.length > 2 && parsed.pathname !== '/') {
      const domain = extractDomain(vendor.websiteUrl);
      return {
        exactOrderUrl: vendor.websiteUrl,
        hasWebsite: true,
        domainName: domain,
        actionLabel: `Order on ${domain}`,
        isDirectProductPage: true
      };
    }
  } catch {
    // Ignore URL parse error
  }

  // 5. Known Direct Store Search Engines (takes user directly to buy the item on that store)
  const domain = extractDomain(vendor.websiteUrl);

  if (domain.includes('amazon.')) {
    const exactOrderUrl = query
      ? `https://www.amazon.com/s?k=${encodeURIComponent(query)}`
      : 'https://www.amazon.com';
    return {
      exactOrderUrl,
      hasWebsite: true,
      domainName: 'amazon.com',
      actionLabel: query ? 'Order on amazon.com' : 'Visit amazon.com',
      isDirectProductPage: Boolean(query)
    };
  }

  if (domain.includes('ebay.')) {
    const exactOrderUrl = query
      ? `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`
      : 'https://www.ebay.com';
    return {
      exactOrderUrl,
      hasWebsite: true,
      domainName: 'ebay.com',
      actionLabel: query ? 'Order on ebay.com' : 'Visit ebay.com',
      isDirectProductPage: Boolean(query)
    };
  }

  if (domain.includes('aliexpress.')) {
    const exactOrderUrl = query
      ? `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(query)}`
      : 'https://www.aliexpress.com';
    return {
      exactOrderUrl,
      hasWebsite: true,
      domainName: 'aliexpress.com',
      actionLabel: query ? 'Order on aliexpress.com' : 'Visit aliexpress.com',
      isDirectProductPage: Boolean(query)
    };
  }

  if (domain.includes('digikey.com')) {
    const exactOrderUrl = query
      ? `https://www.digikey.com/en/products/result?keywords=${encodeURIComponent(query)}`
      : 'https://www.digikey.com';
    return {
      exactOrderUrl,
      hasWebsite: true,
      domainName: 'digikey.com',
      actionLabel: query ? 'Order on digikey.com' : 'Visit digikey.com',
      isDirectProductPage: Boolean(query)
    };
  }

  if (domain.includes('mouser.com')) {
    const exactOrderUrl = query
      ? `https://www.mouser.com/c/?q=${encodeURIComponent(query)}`
      : 'https://www.mouser.com';
    return {
      exactOrderUrl,
      hasWebsite: true,
      domainName: 'mouser.com',
      actionLabel: query ? 'Order on mouser.com' : 'Visit mouser.com',
      isDirectProductPage: Boolean(query)
    };
  }

  if (domain.includes('adafruit.com')) {
    const exactOrderUrl = query
      ? `https://www.adafruit.com/search?q=${encodeURIComponent(query)}`
      : 'https://www.adafruit.com';
    return {
      exactOrderUrl,
      hasWebsite: true,
      domainName: 'adafruit.com',
      actionLabel: query ? 'Order on adafruit.com' : 'Visit adafruit.com',
      isDirectProductPage: Boolean(query)
    };
  }

  if (domain.includes('jlcpcb.com')) {
    const exactOrderUrl = query
      ? `https://jlcpcb.com/parts/componentSearch?searchTxt=${encodeURIComponent(query)}`
      : 'https://jlcpcb.com';
    return {
      exactOrderUrl,
      hasWebsite: true,
      domainName: 'jlcpcb.com',
      actionLabel: query ? 'Order on jlcpcb.com' : 'Visit jlcpcb.com',
      isDirectProductPage: Boolean(query)
    };
  }

  if (domain.includes('studentuniverse.com')) {
    return {
      exactOrderUrl: 'https://www.studentuniverse.com/flights',
      hasWebsite: true,
      domainName: 'studentuniverse.com',
      actionLabel: 'Search Flights on studentuniverse.com',
      isDirectProductPage: true
    };
  }

  if (domain.includes('qatarairways.com')) {
    return {
      exactOrderUrl: 'https://www.qatarairways.com/en/student-club.html',
      hasWebsite: true,
      domainName: 'qatarairways.com',
      actionLabel: 'Visit Student Club on qatarairways.com',
      isDirectProductPage: true
    };
  }

  if (domain.includes('github.com')) {
    return {
      exactOrderUrl: 'https://education.github.com/pack',
      hasWebsite: true,
      domainName: 'education.github.com',
      actionLabel: 'Claim Pack on github.com',
      isDirectProductPage: true
    };
  }

  if (domain.includes('notion.so')) {
    return {
      exactOrderUrl: 'https://www.notion.so/product/notion-for-education',
      hasWebsite: true,
      domainName: 'notion.so',
      actionLabel: 'Claim Free Plan on notion.so',
      isDirectProductPage: true
    };
  }

  if (domain.includes('doordash.com')) {
    const exactOrderUrl = query
      ? `https://www.doordash.com/search/store/${encodeURIComponent(query)}/`
      : 'https://www.doordash.com/dashpass/student/';
    return {
      exactOrderUrl,
      hasWebsite: true,
      domainName: 'doordash.com',
      actionLabel: query ? 'Order on doordash.com' : 'Visit doordash.com',
      isDirectProductPage: Boolean(query)
    };
  }

  if (domain.includes('toogoodtogo.com')) {
    return {
      exactOrderUrl: 'https://toogoodtogo.com',
      hasWebsite: true,
      domainName: 'toogoodtogo.com',
      actionLabel: 'Visit toogoodtogo.com',
      isDirectProductPage: false
    };
  }

  if (domain.includes('flexport.com')) {
    return {
      exactOrderUrl: 'https://www.flexport.com',
      hasWebsite: true,
      domainName: 'flexport.com',
      actionLabel: 'Visit flexport.com',
      isDirectProductPage: false
    };
  }

  if (domain.includes('shipbob.com')) {
    return {
      exactOrderUrl: 'https://www.shipbob.com',
      hasWebsite: true,
      domainName: 'shipbob.com',
      actionLabel: 'Visit shipbob.com',
      isDirectProductPage: false
    };
  }

  if (domain.includes('rippling.com')) {
    return {
      exactOrderUrl: 'https://www.rippling.com',
      hasWebsite: true,
      domainName: 'rippling.com',
      actionLabel: 'Visit rippling.com',
      isDirectProductPage: false
    };
  }

  if (domain.includes('pilot.com')) {
    return {
      exactOrderUrl: 'https://pilot.com',
      hasWebsite: true,
      domainName: 'pilot.com',
      actionLabel: 'Visit pilot.com',
      isDirectProductPage: false
    };
  }

  if (domain.includes('cloudflare.com')) {
    return {
      exactOrderUrl: 'https://www.cloudflare.com',
      hasWebsite: true,
      domainName: 'cloudflare.com',
      actionLabel: 'Visit cloudflare.com',
      isDirectProductPage: false
    };
  }

  // 6. Generic website fallback
  const cleanDomain = domain || vendorName;
  if (query && domain) {
    return {
      exactOrderUrl: `https://www.google.com/search?q=${encodeURIComponent(`buy ${query} on ${domain}`)}`,
      hasWebsite: true,
      domainName: cleanDomain,
      actionLabel: `Search on ${cleanDomain}`,
      isDirectProductPage: false
    };
  }

  return {
    exactOrderUrl: vendor.websiteUrl,
    hasWebsite: true,
    domainName: cleanDomain,
    actionLabel: `Visit ${cleanDomain}`,
    isDirectProductPage: false
  };
}

/**
 * Resolves the exact, working, deep-linked URL to buy what the user searched for.
 */
export function resolveVendorSearchUrl(
  vendor: VendorService,
  searchQuery?: string
): string {
  return resolveOrderDestination(vendor, searchQuery).exactOrderUrl;
}

/**
 * Returns an actionable "Buy / View" label for the button.
 */
export function getVendorActionLabel(
  vendor: VendorService,
  searchQuery?: string
): string {
  return resolveOrderDestination(vendor, searchQuery).actionLabel;
}

/**
 * Resolves the direct claim URL for a live web deal.
 */
export function resolveDealSearchUrl(
  deal: Pick<LiveWebDeal, 'claimUrl'> & { vendorName?: string },
  searchQuery?: string
): string {
  const query = (searchQuery || '').trim();
  const claimUrl = deal.claimUrl || '';

  if (isInvalidOrPlaceholderUrl(claimUrl)) {
    if (query) {
      return `https://www.google.com/search?q=${encodeURIComponent(`buy ${query}`)}`;
    }
    return `https://www.google.com/search?q=${encodeURIComponent(`${deal.vendorName}`)}`;
  }

  if (claimUrl.includes('digikey.com') && query) {
    return `https://www.digikey.com/en/products/result?keywords=${encodeURIComponent(query)}`;
  }

  if (claimUrl.includes('adafruit.com') && query) {
    return `https://www.adafruit.com/search?q=${encodeURIComponent(query)}`;
  }

  if (claimUrl.includes('jlcpcb.com') && query) {
    return `https://jlcpcb.com/parts/componentSearch?searchTxt=${encodeURIComponent(query)}`;
  }

  if (claimUrl.includes('studentuniverse.com')) {
    return `https://www.studentuniverse.com/flights`;
  }

  if (claimUrl.includes('doordash.com')) {
    return query ? `https://www.doordash.com/search/store/${encodeURIComponent(query)}/` : 'https://www.doordash.com/dashpass/student/';
  }

  return claimUrl;
}
