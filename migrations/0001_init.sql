CREATE TABLE users (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('github', 'google')),
  provider_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (provider, provider_user_id)
);

-- Only the SHA-256 of the session token is stored, never the token itself.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('solo', 'daily', 'room')),
  day TEXT,
  letter TEXT,
  won INTEGER NOT NULL CHECK (won IN (0, 1)),
  guesses_used INTEGER,
  rounds_won INTEGER,
  created_at INTEGER NOT NULL
);

-- One daily attempt per person per day.
CREATE UNIQUE INDEX results_daily_once ON results (user_id, day) WHERE mode = 'daily';
CREATE INDEX results_user_time ON results (user_id, created_at);
