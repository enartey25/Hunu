import { GeoLocation } from './types';

/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the Haversine formula in kilometers.
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export interface CityPreset {
  city: string;
  stateOrRegion: string;
  country: string;
  latitude: number;
  longitude: number;
}

export const KNOWN_BUSINESS_HUBS: CityPreset[] = [
  { city: 'New York', stateOrRegion: 'NY', country: 'United States', latitude: 40.7128, longitude: -74.006 },
  { city: 'San Francisco', stateOrRegion: 'CA', country: 'United States', latitude: 37.7749, longitude: -122.4194 },
  { city: 'Austin', stateOrRegion: 'TX', country: 'United States', latitude: 30.2672, longitude: -97.7431 },
  { city: 'Chicago', stateOrRegion: 'IL', country: 'United States', latitude: 41.8781, longitude: -87.6298 },
  { city: 'Boston', stateOrRegion: 'MA', country: 'United States', latitude: 42.3601, longitude: -71.0589 },
  { city: 'Seattle', stateOrRegion: 'WA', country: 'United States', latitude: 47.6062, longitude: -122.3321 },
  { city: 'Los Angeles', stateOrRegion: 'CA', country: 'United States', latitude: 34.0522, longitude: -118.2437 },
  { city: 'Atlanta', stateOrRegion: 'GA', country: 'United States', latitude: 33.749, longitude: -84.388 },
  { city: 'London', stateOrRegion: 'England', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278 },
  { city: 'Berlin', stateOrRegion: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.405 },
  { city: 'Toronto', stateOrRegion: 'Ontario', country: 'Canada', latitude: 43.6532, longitude: -79.3832 },
  { city: 'Singapore', stateOrRegion: 'Central', country: 'Singapore', latitude: 1.3521, longitude: 103.8198 },
  { city: 'Sydney', stateOrRegion: 'NSW', country: 'Australia', latitude: -33.8688, longitude: 151.2093 },
  { city: 'Dublin', stateOrRegion: 'Leinster', country: 'Ireland', latitude: 53.3498, longitude: -6.2603 },
  { city: 'Tokyo', stateOrRegion: 'Kanto', country: 'Japan', latitude: 35.6762, longitude: 139.6503 }
];

export function findMatchingCity(query: string): CityPreset | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return KNOWN_BUSINESS_HUBS.find(
    (hub) =>
      hub.city.toLowerCase() === q ||
      hub.city.toLowerCase().includes(q) ||
      `${hub.city}, ${hub.stateOrRegion}`.toLowerCase().includes(q)
  );
}

