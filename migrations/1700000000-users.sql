CREATE TABLE IF NOT EXISTS users (
	id TEXT(36) NOT NULL,
	phone_number INTEGER NOT NULL,
	username TEXT,
	first_name TEXT,
	avatar_url TEXT,
	created_at INTEGER,
	deleted_at INTEGER
);

