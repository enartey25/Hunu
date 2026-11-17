/**
 * Where the map pictures come from, in one place so the source can be changed.
 *
 * OpenStreetMap's own tile servers are free but meant for light use, and they ask for
 * the attribution below. If they refuse tiles to the extension, or before a public
 * launch with real traffic, swap these for a provider with a usage plan (for example
 * CARTO's raster basemaps, which also need attribution).
 */
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
export const TILE_MAX_ZOOM = 19;
