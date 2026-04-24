-- SQLite schema for tokenBao
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT,
  encrypted_key TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_type TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cached_tokens INTEGER,
  cost REAL,
  cached BOOLEAN,
  timestamp TEXT
);

CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT,
  value TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS budget (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT,
  limit INTEGER,
  current INTEGER,
  reset_at TEXT
);

CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  type TEXT,
  pattern TEXT,
  replacement TEXT,
  enabled BOOLEAN,
  priority INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  api_type TEXT,
  model TEXT,
  total_requests INTEGER,
  total_tokens INTEGER,
  total_cost REAL,
  cached_tokens INTEGER
);
