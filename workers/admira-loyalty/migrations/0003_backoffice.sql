-- Backoffice layer: per-customer admin metadata + editable config + audit log.
-- Additive only: existing customer/visit rows and the member-facing API keep
-- working untouched. Tiers are computed at read time (no enum column).

ALTER TABLE customers ADD COLUMN note TEXT;
ALTER TABLE customers ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_customers_archived ON customers(archived);
CREATE INDEX IF NOT EXISTS idx_customers_created  ON customers(created_at);
CREATE INDEX IF NOT EXISTS idx_customers_spend    ON customers(total_spend);

-- Editable program rules written from the backoffice (stamps-for-free,
-- tier ladder, club name, currency...). value is JSON.
CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Audit trail for every write action taken from the backoffice.
CREATE TABLE IF NOT EXISTS admin_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        INTEGER NOT NULL,
  action    TEXT NOT NULL,
  target_id INTEGER,
  detail    TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_log_ts ON admin_log(ts DESC);
