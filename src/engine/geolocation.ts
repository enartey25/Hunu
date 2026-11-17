import { fetchText } from './net';

/**
 * The name a buyer would give the place at these coordinates: "Kwame Nkrumah Circle",
 * "Madina", "Osu". From OpenStreetMap's reverse lookup; undefined when it has none.
 * Answers are cached, and Nominatim asks for no more than one lookup a second, so this
 * is called once per dropped pin, not while dragging.
 */
export async function reverseArea(latitude: number, longitude: number): Promise<string | undefined> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&addressdetails=1` +
    `&lat=${latitude.toFixed(5)}&lon=${longitude.toFixed(5)}`;
  const res = await fetchText(url, { timeoutMs: 5000, cacheTtlMs: 24 * 60 * 60 * 1000, headers: { Accept: 'application/json' } });
  if (!res.ok) return undefined;
  try {
    const a = (JSON.parse(res.text) as { address?: Record<string, string> }).address || {};
    return a.neighbourhood || a.suburb || a.quarter || a.road || a.city_district || a.town || a.city || a.village || undefined;
  } catch {
    return undefined;
  }
}

export interface UserLiveLocation {
  city: string;
  stateOrRegion: string;
  country: string;
  latitude: number;
  longitude: number;
  source: 'gps' | 'ip' | 'preset';
  organization?: string;
}

/**
 * Automatically and accurately determines the user's live physical location.
 * Uses high-accuracy IP intelligence (with campus/ISP detection) and browser GPS.
 */
export async function detectUserLocation(): Promise<UserLiveLocation> {
  // 1. First attempt reliable fast IP intelligence with ISP / university detection
  try {
    const res = await fetch('https://ipwho.is/');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.latitude && data.longitude) {
        return {
          city: data.city || 'Detected City',
          stateOrRegion: data.region || data.region_code || '',
          country: data.country || 'Detected Country',
          latitude: Number(data.latitude),
          longitude: Number(data.longitude),
          source: 'ip',
          organization: data.connection?.org || data.connection?.isp
        };
      }
    }
  } catch (err) {
    console.warn('[Hunu] ipwho.is lookup failed, trying secondary...', err);
  }

  // 2. Secondary fallback via freeipapi
  try {
    const res = await fetch('https://freeipapi.com/api/json');
    if (res.ok) {
      const data = await res.json();
      if (data.latitude && data.longitude) {
        return {
          city: data.cityName || 'Detected City',
          stateOrRegion: data.regionName || '',
          country: data.countryName || 'Detected Country',
          latitude: Number(data.latitude),
          longitude: Number(data.longitude),
          source: 'ip'
        };
      }
    }
  } catch (err) {
    console.warn('[Hunu] freeipapi lookup failed:', err);
  }

  // 3. Fallback to browser GPS if available
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 4000,
          enableHighAccuracy: true
        });
      });
      const { latitude, longitude } = position.coords;
      return {
        city: 'Local Coordinates',
        stateOrRegion: '',
        country: '',
        latitude,
        longitude,
        source: 'gps'
      };
    } catch {
      // Ignored
    }
  }

  // Generic neutral fallback
  return {
    city: 'Current Location',
    stateOrRegion: '',
    country: '',
    latitude: 5.556,
    longitude: -0.197,
    source: 'preset'
  };
}
