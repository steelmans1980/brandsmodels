-- The Car Archive: visitor interactions in their own tables.
-- The tables from 0001 (favourites, fav_networks, rate_limits, submissions) belong to the earlier fashion website.
-- They are left exactly as they are and are never read or written by the car site, so no earlier record can be shown
-- or reinterpreted as car data. They can be exported and dropped later, after a separate decision.

-- One row per (browser, item) in a Dream garage. item is 'family:<family id>' or 'generation:<generation id>'.
-- The browser id is random, created in the visitor's browser, and stored only as a SHA-256 hash. The primary key makes
-- repeated or retried saves idempotent.
CREATE TABLE IF NOT EXISTS car_garage (
  visitor_hash TEXT NOT NULL,
  item         TEXT NOT NULL,
  created_at   INTEGER NOT NULL,           -- unix ms
  counted      INTEGER NOT NULL DEFAULT 1, -- 0 once a network's daily cap is reached: kept, but not in public counts
  PRIMARY KEY (visitor_hash, item)
);
CREATE INDEX IF NOT EXISTS car_garage_item ON car_garage (item, counted, created_at);

-- Browsers seen saving from one network on one day (network = daily-rotating salted hash of the address).
CREATE TABLE IF NOT EXISTS car_garage_networks (
  ip_day       TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  day          TEXT NOT NULL,              -- YYYY-MM-DD, purged after two days
  PRIMARY KEY (ip_day, visitor_hash)
);

-- Fixed-window rate limits.
CREATE TABLE IF NOT EXISTS car_rate_limits (
  key    TEXT NOT NULL,
  bucket TEXT NOT NULL,
  count  INTEGER NOT NULL,
  day    TEXT NOT NULL,
  PRIMARY KEY (key, bucket)
);

-- Suggestions: a private moderation queue. Never published automatically.
CREATE TABLE IF NOT EXISTS car_submissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  type        TEXT NOT NULL,                     -- car | source | correction
  make        TEXT NOT NULL,
  model       TEXT NOT NULL,
  generation  TEXT,
  market      TEXT,
  year        INTEGER,
  year_kind   TEXT,                              -- model | calendar | NULL (not sure)
  source_url  TEXT,
  photo_url   TEXT,
  note        TEXT NOT NULL,
  target      TEXT,                              -- '<generation id>[#<item id>]' when sent from a page
  page        TEXT,
  ip_day      TEXT NOT NULL,                     -- daily network code, for spam limits only
  reviewed_at INTEGER,
  review_note TEXT,
  overlay     TEXT,                              -- JSON overlay entry approved by the reviewer, if any
  exported_at INTEGER
);
CREATE INDEX IF NOT EXISTS car_submissions_status ON car_submissions (status, created_at);
