CREATE TABLE IF NOT EXISTS newsletter_campaigns (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK(revision > 0),
  status TEXT NOT NULL CHECK(status IN ('draft', 'approved', 'dispatching', 'accepted', 'uncertain')),
  updated_at TEXT NOT NULL,
  document TEXT NOT NULL CHECK(json_valid(document))
);
CREATE INDEX IF NOT EXISTS newsletter_campaigns_recent ON newsletter_campaigns (updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  consent_at TEXT NOT NULL,
  consent_reference TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  unsubscribed_at TEXT
);
CREATE INDEX IF NOT EXISTS newsletter_subscribers_active ON newsletter_subscribers (unsubscribed_at, id);
