// Removes the rows `npm run test:e2e` creates: the "hunutest zx81 kettle" price report
// and the "Hunutest ZX81 Stall" shop pin, with their votes.
import pg from 'pg';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL_UNPOOLED or DATABASE_URL must be set (see ../.env.local).');
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const reports = await client.query(`DELETE FROM price_reports WHERE product = 'hunutest zx81 kettle'`);
  const shops = await client.query(`DELETE FROM shop_pins WHERE name = 'Hunutest ZX81 Stall'`);
  const ratings = await client.query(`DELETE FROM seller_ratings WHERE seller_key = 'name:hunutest zx81 seller|circle'`);
  console.log(`Removed ${reports.rowCount} test report(s), ${shops.rowCount} test shop pin(s) and ${ratings.rowCount} test rating(s), with their votes.`);
} finally {
  await client.end();
}
