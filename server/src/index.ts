/**
 * Entry for hosts that take a web-standard `fetch` handler: Neon Functions, and any
 * WinterTC-style runtime. DATABASE_URL is injected by Neon or set by the host; the
 * Realtime variables are present when Realtime is enabled on the branch.
 */
import { Pool } from 'pg';
import { attachDatabasePool } from '@neon/functions';
import { createApp } from './app';
import { createSealer, liveConfig } from './live';
import { serverSearch } from './search';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

const pool = new Pool({ connectionString, max: 5 });
attachDatabasePool(pool);

const live = liveConfig(process.env);
if (!live) {
  // Names only, never values: says which setting is missing when live prices are off.
  const present = (k: string) => (process.env[k] ? 'set' : 'missing');
  console.warn(
    `[hunu-api] live prices off: HUNU_REALTIME_URL ${present('HUNU_REALTIME_URL')}, HUNU_REALTIME_SECRET ${present('HUNU_REALTIME_SECRET')}, DATABASE_URL ${present('DATABASE_URL')}`
  );
}

export default createApp(pool, {
  hashSalt: process.env.HUNU_HASH_SALT,
  search: serverSearch,
  fares: process.env.TRAVELPAYOUTS_TOKEN
    ? { token: process.env.TRAVELPAYOUTS_TOKEN, marker: process.env.TRAVELPAYOUTS_MARKER }
    : undefined,
  live: live && { url: live.url, seal: createSealer(live) }
});
