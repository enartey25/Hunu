/**
 * The shared price API. Buyers who choose to share a quote file it here; everyone
 * searching for that product nearby gets it back as a community price.
 *
 * No accounts: each extension install sends a random device id, stored only as a hash,
 * which is enough to rate-limit and to stop one device voting twice.
 */
import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  HIDE_AFTER_FLAGS,
  MAX_RESULTS,
  NEARBY_KM,
  REPORTS_PER_DEVICE_PER_DAY,
  REPORTS_PER_IP_PER_DAY,
  REPORT_MAX_AGE_DAYS,
  VOTES_PER_DEVICE_PER_DAY,
  boundingBox,
  checkDeviceId,
  checkQuery,
  checkReport,
  checkReportId,
  checkShop,
  checkRating,
  checkSellerKey,
  MAX_RATING_KEYS,
  RATINGS_PER_DEVICE_PER_DAY,
  RATINGS_PER_IP_PER_DAY,
  SHOPS_PER_DEVICE_PER_DAY,
  SHOPS_PER_IP_PER_DAY
} from './validate';
import { checkDeliveryQuery, shopifyRates } from './delivery';
import { checkFareQuery, cheapestFare, findFares } from './travel';

/**
 * Per-address limits for the endpoints that make outbound requests. Kept in memory: each
 * running instance counts its own, which is enough to stop one client hammering stores.
 */
function createLimiter(windowMs = 60 * 60 * 1000) {
  const hits = new Map<string, { start: number; n: number }>();
  return {
    take(key: string, max: number): boolean {
      const now = Date.now();
      const h = hits.get(key);
      if (!h || now - h.start > windowMs) {
        if (hits.size > 10_000) hits.clear();
        hits.set(key, { start: now, n: 1 });
        return true;
      }
      h.n += 1;
      return h.n <= max;
    }
  };
}

/** What a shop search returns for each pin. */
export interface PublicShop {
  id: number;
  name: string;
  sells: string;
  area: string;
  latitude: number;
  longitude: number;
  pinnedAt: string;
  confirmations: number;
}

/** The slice of a `pg` Pool the API uses, so tests can pass a fake. */
export interface Db {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

export interface AppOptions {
  /** Mixed into every hash so the stored values cannot be matched against a list of ids or addresses. */
  hashSalt?: string;
  /** Runs a search on the server, for the website. Returns undefined for a bad request. */
  search?: (body: unknown) => Promise<unknown | undefined>;
  /** Flight fares (Travelpayouts). Without it, trip searches show published Ghana fares only. */
  fares?: import('./travel').FareConfig;
  /** Live shared prices, when Neon Realtime is enabled. */
  live?: {
    /** The Realtime WebSocket endpoint the client subscribes through. */
    url: string;
    seal: (query: import('./validate').ReportQuery) => Promise<unknown>;
  };
}

/** What a search returns for each report. */
export interface PublicReport {
  id: number;
  product: string;
  amount: number;
  currency: string;
  sellerName: string;
  area: string;
  latitude: number | null;
  longitude: number | null;
  reportedAt: string;
  confirmations: number;
}

const DEVICE_HEADER = 'x-hunu-device';
const WATCHES_PER_DEVICE = 10;
/** Routes re-checked per daily run; the oldest-checked go first. */
const WATCH_CHECKS_PER_RUN = 300;

export function createApp(db: Db, options: AppOptions = {}) {
  const salt = options.hashSalt || '';
  const hash = (value: string) => createHash('sha256').update(salt + value).digest('hex');

  const app = new Hono();
  const limiter = createLimiter();

  // The extension calls with host permissions; the mobile page calls from its own origin.
  // There are no cookies, so any origin may read.
  app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['content-type', DEVICE_HEADER], maxAge: 86400 }));

  app.onError((err, c) => {
    console.error('[hunu-api]', err);
    return c.json({ error: 'Something went wrong on our side.' }, 500);
  });

  app.get('/', (c) => {
    c.header('cache-control', 'no-store');
    return c.json({ service: 'hunu prices', ok: true, live: !!options.live });
  });

  app.get('/reports', async (c) => {
    const checked = checkQuery({ q: c.req.query('q'), lat: c.req.query('lat'), lon: c.req.query('lon') });
    if (!checked.ok) return c.json({ error: checked.error }, 400);
    const { tokens, latitude, longitude } = checked.value;

    // Most of the search's words must appear, so "laptop" alone does not match every laptop.
    const minOverlap = Math.max(1, Math.ceil(tokens.length / 2));
    const params: unknown[] = [tokens, minOverlap, REPORT_MAX_AGE_DAYS, HIDE_AFTER_FLAGS, MAX_RESULTS];
    let near = '';
    if (latitude !== null && longitude !== null) {
      const box = boundingBox(latitude, longitude, NEARBY_KM);
      params.push(box.minLat, box.maxLat, box.minLon, box.maxLon);
      // A report with no coordinates is kept: the buyer gave only an area name.
      near = 'AND (latitude IS NULL OR (latitude BETWEEN $6 AND $7 AND longitude BETWEEN $8 AND $9))';
    }

    const { rows } = await db.query<{
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
    }>(
      `SELECT id, product, amount, currency, seller_name, area, latitude, longitude, reported_at, confirmations
         FROM (
           SELECT *, cardinality(ARRAY(SELECT unnest(product_tokens) INTERSECT SELECT unnest($1::text[]))) AS overlap
             FROM price_reports
            WHERE product_tokens && $1::text[]
              AND reported_at > now() - make_interval(days => $3)
              AND flags < $4
              ${near}
         ) matched
        WHERE overlap >= $2
        ORDER BY overlap DESC, confirmations DESC, reported_at DESC
        LIMIT $5`,
      params
    );

    const reports: PublicReport[] = rows.map((r) => ({
      id: Number(r.id),
      product: r.product,
      amount: Number(r.amount),
      currency: r.currency.trim(),
      sellerName: r.seller_name,
      area: r.area,
      latitude: r.latitude,
      longitude: r.longitude,
      reportedAt: new Date(r.reported_at).toISOString(),
      confirmations: r.confirmations
    }));
    c.header('cache-control', 'public, max-age=60');
    return c.json({ reports });
  });

  // The same search as GET /reports, sealed for a live subscription. The extension calls
  // this again before the sealed query expires to renew it. A sealed query is a bearer
  // token, so it goes in a POST body and response, never a URL.
  app.post('/reports/live', async (c) => {
    if (!options.live) return c.json({ error: 'Live prices are not enabled.' }, 503);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const checked = checkQuery({
      q: typeof body.q === 'string' ? body.q : undefined,
      lat: body.lat === undefined ? undefined : String(body.lat),
      lon: body.lon === undefined ? undefined : String(body.lon)
    });
    if (!checked.ok) return c.json({ error: checked.error }, 400);
    c.header('cache-control', 'no-store');
    return c.json({ url: options.live.url, sealed: await options.live.seal(checked.value) });
  });

  app.post('/reports', async (c) => {
    const device = checkDeviceId(c.req.header(DEVICE_HEADER));
    if (!device) return c.json({ error: 'Missing device id.' }, 400);
    const body = await c.req.json().catch(() => undefined);
    const checked = checkReport(body);
    if (!checked.ok) return c.json({ error: checked.error }, 400);
    const r = checked.value;

    const deviceHash = hash(device);
    const ipHash = hash(clientIp(c.req.raw.headers));
    const { rows: counts } = await db.query<{ by_device: string; by_ip: string }>(
      `SELECT count(*) FILTER (WHERE device_hash = $1) AS by_device,
              count(*) FILTER (WHERE ip_hash = $2) AS by_ip
         FROM price_reports
        WHERE reported_at > now() - interval '1 day' AND (device_hash = $1 OR ip_hash = $2)`,
      [deviceHash, ipHash]
    );
    if (Number(counts[0]?.by_device) >= REPORTS_PER_DEVICE_PER_DAY || Number(counts[0]?.by_ip) >= REPORTS_PER_IP_PER_DAY) {
      return c.json({ error: 'That is a lot of prices for one day. Try again tomorrow.' }, 429);
    }

    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO price_reports (product, product_tokens, amount, currency, seller_name, area, latitude, longitude, device_hash, ip_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [r.product, r.productTokens, r.amount, r.currency, r.sellerName, r.area, r.latitude, r.longitude, deviceHash, ipHash]
    );
    return c.json({ id: Number(rows[0].id) }, 201);
  });

  /** What can be voted on. The names are constants, never taken from a request. */
  const VOTABLE = {
    report: { table: 'price_reports', votes: 'report_votes', key: 'report_id', noun: 'report' },
    shop: { table: 'shop_pins', votes: 'shop_votes', key: 'shop_id', noun: 'shop' },
    rating: { table: 'seller_ratings', votes: 'seller_rating_votes', key: 'rating_id', noun: 'rating' }
  } as const;

  const vote = (target: keyof typeof VOTABLE, kind: 'confirm' | 'flag') => async (c: import('hono').Context) => {
    const t = VOTABLE[target];
    const device = checkDeviceId(c.req.header(DEVICE_HEADER));
    if (!device) return c.json({ error: 'Missing device id.' }, 400);
    const id = checkReportId(c.req.param('id') || '');
    if (id === undefined) return c.json({ error: `Unknown ${t.noun}.` }, 404);
    const deviceHash = hash(device);

    const { rows: recent } = await db.query<{ n: string }>(
      `SELECT (SELECT count(*) FROM report_votes WHERE device_hash = $1 AND voted_at > now() - interval '1 day')
            + (SELECT count(*) FROM shop_votes WHERE device_hash = $1 AND voted_at > now() - interval '1 day')
            + (SELECT count(*) FROM seller_rating_votes WHERE device_hash = $1 AND voted_at > now() - interval '1 day') AS n`,
      [deviceHash]
    );
    if (Number(recent[0]?.n) >= VOTES_PER_DEVICE_PER_DAY) {
      return c.json({ error: 'Too many votes today. Try again tomorrow.' }, 429);
    }

    const { rows: found } = await db.query<{ device_hash: string }>(`SELECT device_hash FROM ${t.table} WHERE id = $1`, [id]);
    if (found.length === 0) return c.json({ error: `Unknown ${t.noun}.` }, 404);
    // Confirming your own pin or report proves nothing; flagging it is how you take it back.
    if (kind === 'confirm' && found[0].device_hash === deviceHash) {
      return c.json({ error: `You cannot confirm your own ${t.noun}.` }, 409);
    }

    // One statement, so a vote is never recorded without being counted (or the reverse).
    const column = kind === 'confirm' ? 'confirmations' : 'flags';
    const { rows } = await db.query<{ confirmations: number; flags: number }>(
      `WITH vote AS (
         INSERT INTO ${t.votes} (${t.key}, device_hash, kind) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING
         RETURNING 1
       )
       UPDATE ${t.table} SET ${column} = ${column} + 1
        WHERE id = $1 AND EXISTS (SELECT 1 FROM vote)
        RETURNING confirmations, flags`,
      [id, deviceHash, kind]
    );
    if (rows.length === 0) return c.json({ ok: true, counted: false });
    return c.json({ ok: true, counted: true, confirmations: rows[0].confirmations, hidden: rows[0].flags >= HIDE_AFTER_FLAGS });
  };

  app.post('/reports/:id/confirm', vote('report', 'confirm'));
  app.post('/reports/:id/flag', vote('report', 'flag'));

  // --- Shops pinned on the map ----------------------------------------------------

  app.get('/shops', async (c) => {
    const checked = checkQuery({ q: c.req.query('q'), lat: c.req.query('lat'), lon: c.req.query('lon') });
    if (!checked.ok) return c.json({ error: checked.error }, 400);
    const { tokens, latitude, longitude } = checked.value;
    if (latitude === null || longitude === null) return c.json({ error: 'Say where you are.' }, 400);
    const box = boundingBox(latitude, longitude, NEARBY_KM);

    // A shop matches when any of the search's words is in its name or what it sells;
    // the extension's relevance scoring then decides how well.
    const { rows } = await db.query<{
      id: string;
      name: string;
      sells: string;
      area: string;
      latitude: number;
      longitude: number;
      created_at: Date;
      confirmations: number;
    }>(
      `SELECT id, name, sells, area, latitude, longitude, created_at, confirmations
         FROM shop_pins
        WHERE tokens && $1::text[]
          AND flags < $2
          AND latitude BETWEEN $3 AND $4 AND longitude BETWEEN $5 AND $6
        ORDER BY confirmations DESC, created_at DESC
        LIMIT $7`,
      [tokens, HIDE_AFTER_FLAGS, box.minLat, box.maxLat, box.minLon, box.maxLon, MAX_RESULTS]
    );
    const shops: PublicShop[] = rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      sells: r.sells,
      area: r.area,
      latitude: r.latitude,
      longitude: r.longitude,
      pinnedAt: new Date(r.created_at).toISOString(),
      confirmations: r.confirmations
    }));
    c.header('cache-control', 'public, max-age=60');
    return c.json({ shops });
  });

  app.post('/shops', async (c) => {
    const device = checkDeviceId(c.req.header(DEVICE_HEADER));
    if (!device) return c.json({ error: 'Missing device id.' }, 400);
    const checked = checkShop(await c.req.json().catch(() => undefined));
    if (!checked.ok) return c.json({ error: checked.error }, 400);
    const s = checked.value;

    const deviceHash = hash(device);
    const ipHash = hash(clientIp(c.req.raw.headers));
    const { rows: counts } = await db.query<{ by_device: string; by_ip: string }>(
      `SELECT count(*) FILTER (WHERE device_hash = $1) AS by_device,
              count(*) FILTER (WHERE ip_hash = $2) AS by_ip
         FROM shop_pins
        WHERE created_at > now() - interval '1 day' AND (device_hash = $1 OR ip_hash = $2)`,
      [deviceHash, ipHash]
    );
    if (Number(counts[0]?.by_device) >= SHOPS_PER_DEVICE_PER_DAY || Number(counts[0]?.by_ip) >= SHOPS_PER_IP_PER_DAY) {
      return c.json({ error: 'That is a lot of shops for one day. Try again tomorrow.' }, 429);
    }

    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO shop_pins (name, sells, tokens, area, latitude, longitude, device_hash, ip_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [s.name, s.sells, s.tokens, s.area, s.latitude, s.longitude, deviceHash, ipHash]
    );
    return c.json({ id: Number(rows[0].id) }, 201);
  });

  app.post('/shops/:id/confirm', vote('shop', 'confirm'));
  app.post('/shops/:id/flag', vote('shop', 'flag'));

  // --- What Hunu users said about sellers after buying ------------------------------

  app.post('/sellers/rate', async (c) => {
    const device = checkDeviceId(c.req.header(DEVICE_HEADER));
    if (!device) return c.json({ error: 'Missing device id.' }, 400);
    const checked = checkRating(await c.req.json().catch(() => undefined));
    if (!checked.ok) return c.json({ error: checked.error }, 400);
    const r = checked.value;
    const deviceHash = hash(device);
    const ipHash = hash(clientIp(c.req.raw.headers));

    const { rows: counts } = await db.query<{ by_device: string; by_ip: string }>(
      `SELECT count(*) FILTER (WHERE device_hash = $1) AS by_device,
              count(*) FILTER (WHERE ip_hash = $2) AS by_ip
         FROM seller_ratings
        WHERE updated_at > now() - interval '1 day' AND (device_hash = $1 OR ip_hash = $2)`,
      [deviceHash, ipHash]
    );
    if (Number(counts[0]?.by_device) >= RATINGS_PER_DEVICE_PER_DAY || Number(counts[0]?.by_ip) >= RATINGS_PER_IP_PER_DAY) {
      return c.json({ error: 'That is a lot of ratings for one day. Try again tomorrow.' }, 429);
    }

    // One rating per device per seller: rating again changes it.
    const { rows } = await db.query<{ id: string; created: boolean }>(
      `INSERT INTO seller_ratings (seller_key, stars, note, device_hash, ip_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (seller_key, device_hash)
       DO UPDATE SET stars = EXCLUDED.stars, note = EXCLUDED.note, ip_hash = EXCLUDED.ip_hash, updated_at = now()
       RETURNING id, (xmax = 0) AS created`,
      [r.sellerKey, r.stars, r.note, deviceHash, ipHash]
    );
    return c.json({ id: Number(rows[0].id), updated: !rows[0].created }, rows[0].created ? 201 : 200);
  });

  app.get('/sellers/ratings', async (c) => {
    const keys = [...new Set((c.req.query('keys') || '').split(',').map(checkSellerKey).filter((k): k is string => !!k))].slice(0, MAX_RATING_KEYS);
    if (keys.length === 0) return c.json({ ratings: {} });
    const { rows } = await db.query<{ seller_key: string; average: string; count: string; notes: { id: number; stars: number; note: string; at: string }[] | null }>(
      `SELECT seller_key,
              avg(stars)::numeric(3,2) AS average,
              count(*) AS count,
              (array_agg(json_build_object('id', id, 'stars', stars, 'note', note, 'at', updated_at) ORDER BY updated_at DESC)
                 FILTER (WHERE note <> ''))[1:3] AS notes
         FROM seller_ratings
        WHERE seller_key = ANY($1::text[]) AND flags < $2
        GROUP BY seller_key`,
      [keys, HIDE_AFTER_FLAGS]
    );
    const ratings: Record<string, { average: number; count: number; notes: { id: number; stars: number; note: string; at: string }[] }> = {};
    for (const row of rows) {
      ratings[row.seller_key] = { average: Number(row.average), count: Number(row.count), notes: row.notes || [] };
    }
    c.header('cache-control', 'public, max-age=60');
    return c.json({ ratings });
  });

  app.post('/sellers/ratings/:id/flag', vote('rating', 'flag'));

  // --- Exact delivery from a Shopify store's own checkout ---------------------------

  app.post('/delivery/shopify', async (c) => {
    if (!limiter.take(`delivery:${clientIp(c.req.raw.headers)}`, 120)) return c.json({ error: 'Too many lookups. Try again later.' }, 429);
    const q = checkDeliveryQuery(await c.req.json().catch(() => undefined));
    if (!q) return c.json({ error: 'Unknown store or item.' }, 400);
    try {
      const rates = await shopifyRates(q);
      return c.json({ rates, checkedAt: new Date().toISOString() });
    } catch (err) {
      return c.json({ error: `The store did not answer (${String((err as Error).message || err)}).` }, 502);
    }
  });

  // --- Flight fares and watched routes ------------------------------------------------

  app.post('/travel/flights', async (c) => {
    if (!options.fares) return c.json({ error: 'live fares need the Travelpayouts key' }, 503);
    if (!limiter.take(`fares:${clientIp(c.req.raw.headers)}`, 120)) return c.json({ error: 'Too many fare searches. Try again later.' }, 429);
    const q = checkFareQuery(await c.req.json().catch(() => undefined));
    if (!q) return c.json({ error: 'Say where from and where to.' }, 400);
    try {
      const result = await findFares(q, options.fares);
      c.header('cache-control', 'no-store');
      return c.json(result);
    } catch (err) {
      return c.json({ error: `the fare service did not answer (${String((err as Error).message || err)})` }, 502);
    }
  });

  app.post('/travel/watch', async (c) => {
    const device = checkDeviceId(c.req.header(DEVICE_HEADER));
    if (!device) return c.json({ error: 'Missing device id.' }, 400);
    const body = (await c.req.json().catch(() => undefined)) as Record<string, unknown> | undefined;
    const q = checkFareQuery(body);
    if (!q) return c.json({ error: 'Say where from and where to.' }, 400);
    const label = typeof body?.label === 'string' ? body.label.replace(/[\u0000-\u001f<>]/g, ' ').slice(0, 80) : '';
    const price = Number(body?.price);
    const target = Number(body?.targetPrice);
    const deviceHash = hash(device);
    const { rows: count } = await db.query<{ n: string }>('SELECT count(*) AS n FROM fare_watches WHERE device_hash = $1', [deviceHash]);
    if (Number(count[0]?.n) >= WATCHES_PER_DEVICE) return c.json({ error: `You can watch ${WATCHES_PER_DEVICE} routes. Stop watching one first.` }, 429);
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO fare_watches (device_hash, origin, destination, depart, return_date, passengers, label, target_price, last_price, lowest_price, checked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, CASE WHEN $9::numeric IS NULL THEN NULL ELSE now() END)
       ON CONFLICT (device_hash, origin, destination, depart, return_date, passengers)
       DO UPDATE SET label = EXCLUDED.label, target_price = EXCLUDED.target_price
       RETURNING id`,
      [deviceHash, q.origin, q.destination, q.date || '', q.returnDate || '', q.passengers, label,
        Number.isFinite(target) && target > 0 ? target : null, Number.isFinite(price) && price > 0 ? price : null]
    );
    return c.json({ id: Number(rows[0].id) }, 201);
  });

  app.get('/travel/watches', async (c) => {
    const device = checkDeviceId(c.req.header(DEVICE_HEADER));
    if (!device) return c.json({ error: 'Missing device id.' }, 400);
    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT id, origin, destination, depart, return_date, passengers, label, target_price, last_price, previous_price, lowest_price, dropped_at, checked_at
         FROM fare_watches WHERE device_hash = $1 ORDER BY created_at DESC`,
      [hash(device)]
    );
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    c.header('cache-control', 'no-store');
    return c.json({
      watches: rows.map((r) => ({
        id: Number(r.id), origin: r.origin, destination: r.destination, date: r.depart || null, returnDate: r.return_date || null,
        passengers: r.passengers, label: r.label, targetPrice: num(r.target_price), lastPrice: num(r.last_price),
        previousPrice: num(r.previous_price), lowestPrice: num(r.lowest_price), droppedAt: r.dropped_at, checkedAt: r.checked_at, currency: 'GHS'
      }))
    });
  });

  app.post('/travel/watch/:id/delete', async (c) => {
    const device = checkDeviceId(c.req.header(DEVICE_HEADER));
    const id = Number(c.req.param('id'));
    if (!device || !Number.isInteger(id)) return c.json({ error: 'Missing device id.' }, 400);
    const { rowCount } = await db.query('DELETE FROM fare_watches WHERE id = $1 AND device_hash = $2', [id, hash(device)]);
    return c.json({ deleted: (rowCount || 0) > 0 });
  });

  // Neon's daily trigger. The Functions proxy drops client-sent x-neon-* headers, so the
  // header's presence (matching the body) shows the call came from the trigger.
  app.post('/travel/check', async (c) => {
    const body = (await c.req.json().catch(() => undefined)) as { invocation_id?: string } | undefined;
    const invocation = c.req.header('x-neon-trigger-invocation-id');
    if (!invocation || invocation !== body?.invocation_id) return c.json({ error: 'Not a trigger delivery.' }, 401);
    if (!options.fares) return c.json({ checked: 0, note: 'no fare key' });
    const { rows } = await db.query<{ id: string; origin: string; destination: string; depart: string; return_date: string; passengers: number; last_price: string | null; target_price: string | null; lowest_price: string | null }>(
      `SELECT id, origin, destination, depart, return_date, passengers, last_price, target_price, lowest_price
         FROM fare_watches
        WHERE (depart = '' OR depart >= to_char(now(), 'YYYY-MM'))
        ORDER BY checked_at NULLS FIRST LIMIT $1`,
      [WATCH_CHECKS_PER_RUN]
    );
    let checked = 0;
    let dropped = 0;
    for (const w of rows) {
      const price = await cheapestFare(
        { origin: w.origin, destination: w.destination, date: w.depart || undefined, returnDate: w.return_date || undefined, passengers: w.passengers },
        options.fares
      ).catch(() => undefined);
      checked++;
      if (price === undefined) {
        await db.query('UPDATE fare_watches SET checked_at = now() WHERE id = $1', [w.id]);
        continue;
      }
      const last = w.last_price === null ? undefined : Number(w.last_price);
      const target = w.target_price === null ? undefined : Number(w.target_price);
      const fell = (last !== undefined && price < last) || (target !== undefined && price <= target && (last === undefined || last > target));
      if (fell) dropped++;
      await db.query(
        `UPDATE fare_watches
            SET previous_price = last_price, last_price = $2, lowest_price = LEAST(COALESCE(lowest_price, $2), $2),
                dropped_at = CASE WHEN $3 THEN now() ELSE dropped_at END, checked_at = now()
          WHERE id = $1`,
        [w.id, price, fell]
      );
    }
    return c.json({ checked, dropped });
  });

  // --- Search for the website ---------------------------------------------------------

  app.post('/search', async (c) => {
    if (!options.search) return c.json({ error: 'Search is not enabled here.' }, 503);
    if (!limiter.take(`search:${clientIp(c.req.raw.headers)}`, 60)) return c.json({ error: 'Too many searches. Try again in a few minutes.' }, 429);
    const body = await c.req.json().catch(() => undefined);
    const result = await options.search(body);
    if (!result) return c.json({ error: 'Search for a product, and say where you are.' }, 400);
    c.header('cache-control', 'no-store');
    return c.json(result);
  });

  return app;
}

function clientIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    (headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  );
}
