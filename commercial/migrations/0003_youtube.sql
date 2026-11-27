-- Staff-only metadata for videos prepared in YouTube Studio and the latest link check.
-- No media, Google account credentials or provider HTML are stored.
CREATE TABLE sales_youtube_drafts (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  document TEXT NOT NULL CHECK (json_valid(document))
);

CREATE INDEX sales_youtube_drafts_updated ON sales_youtube_drafts(updated_at DESC, id DESC);
