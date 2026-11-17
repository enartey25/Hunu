-- Prices Hunu users chose to share: what a seller quoted them, where, and when.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS price_reports (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product        TEXT        NOT NULL,
  product_tokens TEXT[]      NOT NULL,
  amount         NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  currency       CHAR(3)     NOT NULL,
  seller_name    TEXT        NOT NULL,
  area           TEXT        NOT NULL DEFAULT '',
  latitude       DOUBLE PRECISION,
  longitude      DOUBLE PRECISION,
  reported_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One-way hashes: enough to rate-limit and stop double votes, not to identify anyone.
  device_hash    TEXT        NOT NULL,
  ip_hash        TEXT        NOT NULL,
  confirmations  INTEGER     NOT NULL DEFAULT 0,
  flags          INTEGER     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS price_reports_tokens_idx ON price_reports USING GIN (product_tokens);
CREATE INDEX IF NOT EXISTS price_reports_reported_at_idx ON price_reports (reported_at DESC);
CREATE INDEX IF NOT EXISTS price_reports_device_idx ON price_reports (device_hash, reported_at DESC);
CREATE INDEX IF NOT EXISTS price_reports_ip_idx ON price_reports (ip_hash, reported_at DESC);

-- One confirmation or flag per device per report.
CREATE TABLE IF NOT EXISTS report_votes (
  report_id   BIGINT      NOT NULL REFERENCES price_reports (id) ON DELETE CASCADE,
  device_hash TEXT        NOT NULL,
  kind        TEXT        NOT NULL CHECK (kind IN ('confirm', 'flag')),
  voted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, device_hash)
);

CREATE INDEX IF NOT EXISTS report_votes_device_idx ON report_votes (device_hash, voted_at DESC);

-- Shops Hunu users pinned on the map and chose to share: often a stall or shop that is
-- on no map and publishes no prices. The pinner's phone note for the shop is never sent.
CREATE TABLE IF NOT EXISTS shop_pins (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT        NOT NULL,
  sells         TEXT        NOT NULL DEFAULT '',
  -- Words from the name and what it sells, matched the way a search is.
  tokens        TEXT[]      NOT NULL,
  area          TEXT        NOT NULL DEFAULT '',
  latitude      DOUBLE PRECISION NOT NULL,
  longitude     DOUBLE PRECISION NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_hash   TEXT        NOT NULL,
  ip_hash       TEXT        NOT NULL,
  confirmations INTEGER     NOT NULL DEFAULT 0,
  flags         INTEGER     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS shop_pins_tokens_idx ON shop_pins USING GIN (tokens);
CREATE INDEX IF NOT EXISTS shop_pins_place_idx ON shop_pins (latitude, longitude);
CREATE INDEX IF NOT EXISTS shop_pins_device_idx ON shop_pins (device_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS shop_pins_ip_idx ON shop_pins (ip_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS shop_votes (
  shop_id     BIGINT      NOT NULL REFERENCES shop_pins (id) ON DELETE CASCADE,
  device_hash TEXT        NOT NULL,
  kind        TEXT        NOT NULL CHECK (kind IN ('confirm', 'flag')),
  voted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, device_hash)
);

CREATE INDEX IF NOT EXISTS shop_votes_device_idx ON shop_votes (device_hash, voted_at DESC);

-- What Hunu users said about a seller after buying. One rating per device per seller,
-- which the device can change. Notes are cleaned of contact details before storing.
CREATE TABLE IF NOT EXISTS seller_ratings (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seller_key  TEXT        NOT NULL,
  stars       SMALLINT    NOT NULL CHECK (stars BETWEEN 1 AND 5),
  note        TEXT        NOT NULL DEFAULT '',
  device_hash TEXT        NOT NULL,
  ip_hash     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmations INTEGER   NOT NULL DEFAULT 0,
  flags       INTEGER     NOT NULL DEFAULT 0,
  UNIQUE (seller_key, device_hash)
);

-- Added after the table first shipped; the shared vote handler counts both columns.
ALTER TABLE seller_ratings ADD COLUMN IF NOT EXISTS confirmations INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS seller_ratings_key_idx ON seller_ratings (seller_key);
CREATE INDEX IF NOT EXISTS seller_ratings_device_idx ON seller_ratings (device_hash, updated_at DESC);
CREATE INDEX IF NOT EXISTS seller_ratings_ip_idx ON seller_ratings (ip_hash, updated_at DESC);

CREATE TABLE IF NOT EXISTS seller_rating_votes (
  rating_id   BIGINT      NOT NULL REFERENCES seller_ratings (id) ON DELETE CASCADE,
  device_hash TEXT        NOT NULL,
  kind        TEXT        NOT NULL CHECK (kind IN ('confirm', 'flag')),
  voted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rating_id, device_hash)
);

CREATE INDEX IF NOT EXISTS seller_rating_votes_device_idx ON seller_rating_votes (device_hash, voted_at DESC);

-- Routes a buyer asked Hunu to watch. Checked once a day; a fall below the last price
-- (or below the buyer's target) is shown the next time the device asks.
CREATE TABLE IF NOT EXISTS fare_watches (
  id             BIGSERIAL   PRIMARY KEY,
  device_hash    TEXT        NOT NULL,
  origin         TEXT        NOT NULL,
  destination    TEXT        NOT NULL,
  -- "2026-12-12", a month "2026-12", or '' for any date.
  depart         TEXT        NOT NULL DEFAULT '',
  return_date    TEXT        NOT NULL DEFAULT '',
  passengers     INT         NOT NULL DEFAULT 1 CHECK (passengers BETWEEN 1 AND 9),
  label          TEXT        NOT NULL DEFAULT '',
  target_price   NUMERIC(12, 2),
  last_price     NUMERIC(12, 2),
  previous_price NUMERIC(12, 2),
  lowest_price   NUMERIC(12, 2),
  dropped_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_at     TIMESTAMPTZ,
  UNIQUE (device_hash, origin, destination, depart, return_date, passengers)
);

CREATE INDEX IF NOT EXISTS fare_watches_checked_idx ON fare_watches (checked_at NULLS FIRST);