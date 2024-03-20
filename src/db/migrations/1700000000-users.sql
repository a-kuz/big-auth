CREATE TABLE IF NOT EXISTS users (
	id TEXT(21) NOT NULL,
	phone_number TEXT NOT NULL,
	username TEXT,
	first_name TEXT,
	last_name TEXT,
	avatar_url TEXT,
	created_at INTEGER,
	deleted_at INTEGER
);

