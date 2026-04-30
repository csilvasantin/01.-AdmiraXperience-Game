-- Admira XP marketplace: programmatic + physical inventory.
--
-- A SLOT is a piece of inventory the shop can sell to advertisers. It can be
-- digital (DS screen, Metahuman tótem), audio (jingle in the music thread),
-- physical (paper poster, end-cap of a gondola, counter flyer) or the special
-- "takeover" slot — a single buyer that owns every other slot for a window.
--
-- AUCTIONS are time-windowed English auctions on a slot. CAMPAIGNS are the
-- live ad creatives — a winning bid produces a campaign that runs from the
-- auction close until campaign_ends_at.

CREATE TABLE IF NOT EXISTS slots (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  channel         TEXT NOT NULL,         -- 'digital' | 'physical' | 'audio' | 'takeover'
  kind            TEXT NOT NULL,         -- 'screen' | 'poster' | 'flyer' | 'gondola' | 'jingle' | 'all'
  size            TEXT,                  -- '4K vertical', 'A2', 'A4', '30s', etc
  reserve_price   INTEGER NOT NULL DEFAULT 0,
  description     TEXT,
  surface_ref     TEXT,                  -- optional pointer to in-game surface (ds1, ds2, escaparate, metahuman, hilo, poster-a...)
  sort_order      INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS auctions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_id         TEXT NOT NULL,
  starts_at       INTEGER NOT NULL,
  ends_at         INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'live',  -- 'live' | 'awarded' | 'noBids'
  winning_bid_id  INTEGER,
  FOREIGN KEY (slot_id) REFERENCES slots(id)
);
CREATE INDEX IF NOT EXISTS idx_auctions_slot ON auctions(slot_id, status);
CREATE INDEX IF NOT EXISTS idx_auctions_endsat ON auctions(ends_at, status);

CREATE TABLE IF NOT EXISTS bids (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  auction_id      INTEGER NOT NULL,
  bidder_name     TEXT NOT NULL,
  bidder_email    TEXT,
  amount          INTEGER NOT NULL,
  brand_name      TEXT NOT NULL,
  brand_color     TEXT NOT NULL DEFAULT '#78f3ff',
  brand_message   TEXT,
  brand_logo_url  TEXT,
  ts              INTEGER NOT NULL,
  ip_hash         TEXT,
  FOREIGN KEY (auction_id) REFERENCES auctions(id)
);
CREATE INDEX IF NOT EXISTS idx_bids_auction ON bids(auction_id, amount DESC);

CREATE TABLE IF NOT EXISTS campaigns (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  bid_id          INTEGER NOT NULL,
  slot_id         TEXT NOT NULL,
  starts_at       INTEGER NOT NULL,
  ends_at         INTEGER NOT NULL,
  active          INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (bid_id) REFERENCES bids(id),
  FOREIGN KEY (slot_id) REFERENCES slots(id)
);
CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns(slot_id, active, ends_at);
