-- Visitor interactions. Kept apart from the archive data (data/campaigns.json), which never reads from here.

-- One row per (browser, model) favourite. The browser id is a random value created in the visitor's browser and
-- stored here only as a SHA-256 hash. Set semantics make repeated or retried requests idempotent.
CREATE TABLE IF NOT EXISTS favourites (
  visitor_hash TEXT NOT NULL,
  model        TEXT NOT NULL,          -- model slug, e.g. 'kendall-jenner'
  created_at   INTEGER NOT NULL,       -- unix ms
  counted      INTEGER NOT NULL DEFAULT 1, -- 0 when a per-network cap was reached (kept for the visitor, not counted)
  PRIMARY KEY (visitor_hash, model)
);
CREATE INDEX IF NOT EXISTS favourites_model ON favourites (model, counted, created_at);

-- Browsers seen favouriting from one network on one day (network = daily-rotating hash of the IP; no IPs stored).
CREATE TABLE IF NOT EXISTS fav_networks (
  ip_day       TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  day          TEXT NOT NULL,          -- YYYY-MM-DD, for purging after two days
  PRIMARY KEY (ip_day, visitor_hash)
);

-- Fixed-window rate limits.
CREATE TABLE IF NOT EXISTS rate_limits (
  key    TEXT NOT NULL,                -- e.g. 'fav:<ip_day>' or 'sub:<ip_day>'
  bucket TEXT NOT NULL,                -- window id, e.g. hour number
  count  INTEGER NOT NULL,
  day    TEXT NOT NULL,
  PRIMARY KEY (key, bucket)
);

-- Community suggestions: a private moderation queue. Never published automatically.
CREATE TABLE IF NOT EXISTS submissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  type        TEXT NOT NULL,                     -- missing | correction
  model       TEXT NOT NULL,
  brand       TEXT NOT NULL,
  kind        TEXT NOT NULL,                     -- campaign | runway | cover | ambassador
  year        INTEGER,
  season      TEXT,
  source_url  TEXT NOT NULL,
  note        TEXT NOT NULL,
  record_id   TEXT,                              -- the credit a correction refers to
  page        TEXT,                              -- the archive page it was sent from
  ip_day      TEXT NOT NULL,                     -- daily-rotating network hash, for spam limits only
  reviewed_at INTEGER,
  review_note TEXT,
  overlay     TEXT,                              -- JSON overlay entry prepared on approval
  exported_at INTEGER                            -- when the approved entry was exported to data/overlay.json
);
CREATE INDEX IF NOT EXISTS submissions_status ON submissions (status, created_at);
