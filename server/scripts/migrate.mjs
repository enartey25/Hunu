// Applies server/schema.sql to the database in DATABASE_URL_UNPOOLED (or DATABASE_URL).
// Run from server/: `npm run migrate`. The connection string is never printed.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL_UNPOOLED or DATABASE_URL must be set (see ../.env.local).');
  process.exit(1);
}

const sql = readFileSync(fileURLToPath(new URL('../schema.sql', import.meta.url)), 'utf8');
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(sql);
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('price_reports', 'report_votes', 'shop_pins', 'shop_votes', 'seller_ratings', 'seller_rating_votes', 'fare_watches') ORDER BY 1`
  );
  console.log('Schema applied. Tables:', rows.map((r) => r.table_name).join(', '));
} finally {
  await client.end();
}
