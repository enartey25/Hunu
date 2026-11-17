/**
 * Entry for a plain Node host (a VPS, Render, Railway, Fly) and for local runs:
 * `npm run dev` in server/ reads DATABASE_URL from ../.env.local.
 */
import { serve } from '@hono/node-server';
import { Pool } from 'pg';
import { createApp } from './app';
import { createSealer, liveConfig } from './live';
import { serverSearch } from './search';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

const pool = new Pool({ connectionString, max: 5 });
// An idle connection the pooler closes must not take the process down.
pool.on('error', (err) => console.error('[hunu-api] idle client error', err.message));

const port = Number(process.env.PORT) || 8787;
const live = liveConfig(process.env);
const app = createApp(pool, { hashSalt: process.env.HUNU_HASH_SALT, search: serverSearch,
  fares: process.env.TRAVELPAYOUTS_TOKEN ? { token: process.env.TRAVELPAYOUTS_TOKEN, marker: process.env.TRAVELPAYOUTS_MARKER } : undefined,
  live: live && { url: live.url, seal: createSealer(live) } });
serve({ fetch: app.fetch, port }, () =>
  console.log(`[hunu-api] listening on http://localhost:${port}`)
);
