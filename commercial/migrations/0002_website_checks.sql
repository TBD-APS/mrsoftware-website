-- Facts from a lead's own website, one row per CVR number, replaced by the next check.
-- Page text is never stored; see commercial/server/website-facts.mjs.
CREATE TABLE sales_website_checks (
  cvr TEXT PRIMARY KEY CHECK (length(cvr) = 8),
  checked_at TEXT NOT NULL,
  document TEXT NOT NULL CHECK (json_valid(document))
);

-- Firecrawl credits reserved per calendar month (UTC, YYYY-MM), held under FIRECRAWL_MONTHLY_CREDITS.
CREATE TABLE sales_firecrawl_usage (
  month TEXT PRIMARY KEY,
  credits INTEGER NOT NULL CHECK (credits >= 0)
);
