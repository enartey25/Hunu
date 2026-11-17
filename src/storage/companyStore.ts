import { CompanyProfile } from '../engine/types';
import { detectUserLocation } from '../engine/geolocation';

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  id: 'default-profile',
  userRole: 'student', // Default to student/academic mode since user is at university campus
  companyName: 'University Scholar / Engineering Lab',
  industry: 'Academic Research & Engineering',
  headcount: '1-10',
  budgetTier: 'Bootstrap',
  studentProfile: {
    institution: 'University of Ghana',
    majorOrDepartment: 'Computer Science & Engineering',
    academicLevel: 'Undergraduate',
    hasEduEmail: true
  },
  location: {
    city: 'Accra',
    stateOrRegion: 'Greater Accra',
    country: 'Ghana',
    latitude: 5.5560204,
    longitude: -0.1969371,
    maxPreferredDistanceKm: 0,
    organization: 'University of Ghana'
  },
  priorityWeights: {
    priceWeight: 0.45,
    locationWeight: 0.25,
    fitWeight: 0.20,
    qualityWeight: 0.10
  },
  preferredContract: 'any'
};

const STORAGE_KEY = 'hunu_company_profile';
const CUSTOM_QUOTES_KEY = 'hunu_custom_quotes';

export async function getCustomQuotes(): Promise<import('../engine/types').VendorService[]> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get(CUSTOM_QUOTES_KEY);
      if (res && res[CUSTOM_QUOTES_KEY]) {
        return res[CUSTOM_QUOTES_KEY] as import('../engine/types').VendorService[];
      }
    } else if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(CUSTOM_QUOTES_KEY);
      if (stored) return JSON.parse(stored);
    }
  } catch (err) {
    console.warn('[Hunu] Error loading custom quotes:', err);
  }
  return [];
}

export async function saveCustomQuote(quote: import('../engine/types').VendorService): Promise<void> {
  const existing = await getCustomQuotes();
  const updated = [quote, ...existing.filter((q) => q.id !== quote.id)];
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [CUSTOM_QUOTES_KEY]: updated });
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CUSTOM_QUOTES_KEY, JSON.stringify(updated));
    }
  } catch (err) {
    console.error('[Hunu] Error saving custom quote:', err);
  }
}

export async function deleteCustomQuote(quoteId: string): Promise<void> {
  const existing = await getCustomQuotes();
  const updated = existing.filter((q) => q.id !== quoteId);
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [CUSTOM_QUOTES_KEY]: updated });
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CUSTOM_QUOTES_KEY, JSON.stringify(updated));
    }
  } catch (err) {
    console.error('[Hunu] Error deleting custom quote:', err);
  }
}

export async function getCompanyProfile(): Promise<CompanyProfile> {
  let profile = DEFAULT_COMPANY_PROFILE;

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      const result = await chrome.storage.sync.get(STORAGE_KEY);
      if (result && result[STORAGE_KEY]) {
        profile = { ...DEFAULT_COMPANY_PROFILE, ...result[STORAGE_KEY] };
      }
    } else if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        profile = { ...DEFAULT_COMPANY_PROFILE, ...JSON.parse(stored) };
      }
    }
  } catch (err) {
    console.warn('[Hunu] Error loading profile from storage, using defaults:', err);
  }

  // If location has never been detected or is set to NY/Austin placeholder, auto-detect immediately
  if (profile.location.city === 'Austin' || profile.location.city === 'New York' || profile.id === 'default-profile') {
    try {
      const liveLoc = await detectUserLocation();
      profile = {
        ...profile,
        location: {
          ...profile.location,
          city: liveLoc.city,
          stateOrRegion: liveLoc.stateOrRegion,
          country: liveLoc.country,
          latitude: liveLoc.latitude,
          longitude: liveLoc.longitude,
          organization: liveLoc.organization
        }
      };

      if (liveLoc.organization?.includes('University')) {
        profile.userRole = 'student';
        if (profile.studentProfile) {
          profile.studentProfile.institution = liveLoc.organization;
        }
      }

      // Save detected location
      await saveCompanyProfile(profile);
    } catch {
      // Keep profile
    }
  }

  return profile;
}

export async function saveCompanyProfile(profile: CompanyProfile): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      await chrome.storage.sync.set({ [STORAGE_KEY]: profile });
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    }

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'HUNU_PROFILE_UPDATED', profile }).catch(() => {
        // Ignore inactive listener errors
      });
    }
  } catch (err) {
    console.error('[Hunu] Failed to save company profile:', err);
    throw err;
  }
}
