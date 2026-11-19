CREATE TABLE sales_customers (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  document TEXT NOT NULL CHECK (json_valid(document))
);

CREATE INDEX sales_customers_updated ON sales_customers(updated_at DESC, id DESC);

CREATE TABLE sales_opportunities (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES sales_customers(id),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  document TEXT NOT NULL CHECK (json_valid(document))
);

CREATE INDEX sales_opportunities_updated ON sales_opportunities(updated_at DESC, id DESC);
CREATE INDEX sales_opportunities_customer ON sales_opportunities(customer_id);

CREATE TABLE sales_quotes (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES sales_customers(id),
  opportunity_id TEXT REFERENCES sales_opportunities(id),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  document TEXT NOT NULL CHECK (json_valid(document))
);

CREATE INDEX sales_quotes_updated ON sales_quotes(updated_at DESC, id DESC);
CREATE INDEX sales_quotes_customer ON sales_quotes(customer_id);

CREATE TABLE sales_catalog (
  id TEXT PRIMARY KEY CHECK (id = 'catalog'),
  revision INTEGER NOT NULL CHECK (revision >= 2),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  document TEXT NOT NULL CHECK (json_valid(document))
);

CREATE TABLE sales_events (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  document TEXT NOT NULL CHECK (json_valid(document))
);

CREATE INDEX sales_events_updated ON sales_events(updated_at DESC, id DESC);

CREATE TABLE sales_enquiries (
  request_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE sales_enquiry_limits (
  network_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK (count BETWEEN 1 AND 5),
  PRIMARY KEY (network_hash, window_start)
);
