/**
 * Search for the website. A web page cannot ask Jiji, Jumia or the other stores itself
 * (they do not allow it from other sites), so the website sends the search here and the
 * same engine the extension runs asks the stores. Results come back unranked; the page
 * ranks them with the buyer's own priorities, exactly as the extension does.
 */
import { runLiveSearch } from '../../src/engine/liveSearch';
import { DEFAULT_COMPANY_PROFILE } from '../../src/storage/companyStore';
import { ALL_SERVICE_CATEGORIES } from '../../src/engine/vendorDatabase';
import { CompanyProfile, ServiceCategory } from '../../src/engine/types';

const CATEGORIES = new Set<string>(ALL_SERVICE_CATEGORIES.map((c) => c.category));
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max) : '');
const coord = (v: unknown, limit: number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : undefined;
};

export async function serverSearch(body: unknown): Promise<unknown | undefined> {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  const q = text(b.q, 120);
  const latitude = coord(b.lat, 90);
  const longitude = coord(b.lon, 180);
  if (q.length < 2 || latitude === undefined || longitude === undefined) return undefined;
  const category = typeof b.category === 'string' && CATEGORIES.has(b.category) ? (b.category as ServiceCategory) : undefined;

  const profile: CompanyProfile = {
    ...DEFAULT_COMPANY_PROFILE,
    location: {
      ...DEFAULT_COMPANY_PROFILE.location,
      city: text(b.city, 60) || DEFAULT_COMPANY_PROFILE.location.city,
      stateOrRegion: text(b.region, 60) || DEFAULT_COMPANY_PROFILE.location.stateOrRegion,
      country: text(b.country, 60) || DEFAULT_COMPANY_PROFILE.location.country,
      latitude,
      longitude
    }
  };
  const result = await runLiveSearch(q, profile, { category, signal: AbortSignal.timeout(25_000) });
  return result;
}
