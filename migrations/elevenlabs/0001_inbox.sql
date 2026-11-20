-- Opt-in host migration. Package installation never runs SQL.
CREATE TABLE IF NOT EXISTS elevenlabs_inbox (
  tenant_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  event_key TEXT NOT NULL CHECK(length(event_key) = 64),
  event_type TEXT NOT NULL,
  event_timestamp INTEGER NOT NULL,
  payload TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, application_id, connection_id, event_key)
);
CREATE INDEX IF NOT EXISTS elevenlabs_inbox_received ON elevenlabs_inbox(received_at);
