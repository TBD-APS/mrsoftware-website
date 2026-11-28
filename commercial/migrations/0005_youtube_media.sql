CREATE TABLE sales_youtube_media (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES sales_youtube_drafts(id),
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
  draft_revision INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('submitting', 'pending', 'completed', 'failed', 'uncertain')),
  provider_id TEXT
);
CREATE INDEX sales_youtube_media_draft ON sales_youtube_media(draft_id, created_at DESC, id DESC);
CREATE UNIQUE INDEX sales_youtube_media_active ON sales_youtube_media(draft_id,kind)
  WHERE state IN ('submitting','pending','uncertain');
