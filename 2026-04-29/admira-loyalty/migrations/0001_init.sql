CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  avatar_emoji  TEXT NOT NULL DEFAULT '🙂',
  stamps        INTEGER NOT NULL DEFAULT 0,
  total_visits  INTEGER NOT NULL DEFAULT 0,
  total_spend   INTEGER NOT NULL DEFAULT 0,
  free_pending  INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL DEFAULT 0,
  last_checkin  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_customers_checkin ON customers(last_checkin);

CREATE TABLE IF NOT EXISTS visits (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id  INTEGER NOT NULL,
  ts           INTEGER NOT NULL,
  product      TEXT,
  revenue      INTEGER NOT NULL DEFAULT 0,
  was_free     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_visits_customer ON visits(customer_id, ts DESC);
