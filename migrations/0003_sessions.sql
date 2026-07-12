-- Migration number: 0003 	 2026-07-12
CREATE TABLE sessions (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	expires_at INTEGER NOT NULL
);

CREATE INDEX sessions_user_id ON sessions (user_id);
