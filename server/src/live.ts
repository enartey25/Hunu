/**
 * Live shared prices. The API seals the same search GET /reports runs, and the
 * extension subscribes to it through Neon Realtime: a price another buyer shares, or a
 * confirmation or flag, reaches everyone looking at that product without a refresh.
 */
import { createRealtime, pgParam, rawSql } from '@neon/realtime/server';
import { HIDE_AFTER_FLAGS, MAX_RESULTS, NEARBY_KM, REPORT_MAX_AGE_DAYS, ReportQuery, boundingBox } from './validate';

/** A report row as Realtime delivers it: int8 and numeric arrive as strings, timestamptz as a Date. */
export interface LiveReportRow {
  id: string;
  product: string;
  amount: string;
  currency: string;
  seller_name: string;
  area: string;
  latitude: number | null;
  longitude: number | null;
  reported_at: Date;
  confirmations: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The live search. A live query may not call now(), so the age cutoff is a parameter,
 * rounded to the start of the UTC day: every renewal that day seals the identical query,
 * which Realtime requires.
 */
export function liveReportsQuery(query: ReportQuery, now: number = Date.now()) {
  const cutoff = new Date(Math.floor(now / DAY_MS) * DAY_MS - REPORT_MAX_AGE_DAYS * DAY_MS);
  const minOverlap = Math.max(1, Math.ceil(query.tokens.length / 2));
  const params: unknown[] = [pgParam.array('text', query.tokens), minOverlap, pgParam.timestamptz(cutoff), HIDE_AFTER_FLAGS, MAX_RESULTS];
  let near = '';
  if (query.latitude !== null && query.longitude !== null) {
    const box = boundingBox(query.latitude, query.longitude, NEARBY_KM);
    params.push(box.minLat, box.maxLat, box.minLon, box.maxLon);
    near = 'AND (r.latitude IS NULL OR (r.latitude BETWEEN $6 AND $7 AND r.longitude BETWEEN $8 AND $9))';
  }
  // Realtime refuses set-returning functions in a SELECT list, so the word overlap is
  // counted in a LATERAL join instead of the ARRAY(... INTERSECT ...) GET /reports uses.
  return rawSql<LiveReportRow>(
    `SELECT r.id, r.product, r.amount, r.currency, r.seller_name, r.area, r.latitude, r.longitude, r.reported_at, r.confirmations
       FROM price_reports r
       CROSS JOIN LATERAL (
         SELECT count(*) AS overlap FROM unnest(r.product_tokens) AS t(token) WHERE t.token = ANY($1::text[])
       ) o
      WHERE r.product_tokens && $1::text[]
        AND o.overlap >= $2
        AND r.reported_at > $3
        AND r.flags < $4
        ${near}
      ORDER BY o.overlap DESC, r.confirmations DESC, r.reported_at DESC
      LIMIT $5`,
    params as never
  );
}

export interface LiveConfig {
  secret: string;
  url: string;
  db: string;
}

/** Realtime settings from the environment, or undefined when Realtime is not enabled. */
export function liveConfig(env: NodeJS.ProcessEnv): LiveConfig | undefined {
  const secret = env.HUNU_REALTIME_SECRET || env.NEON_REALTIME_SECRET;
  const url = env.HUNU_REALTIME_URL || env.NEON_REALTIME_URL;
  const databaseUrl = env.DATABASE_URL;
  if (!secret || !url || !databaseUrl) return undefined;
  const db = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, '')) || 'neondb';
  return { secret, url, db };
}

export function createSealer(config: LiveConfig) {
  const realtime = createRealtime({ secret: config.secret, db: config.db });
  return (query: ReportQuery) => realtime.seal({ query: liveReportsQuery(query) });
}
