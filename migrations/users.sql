CREATE TABLE users (
	id TEXT(36) NOT NULL,
	phone_number INTEGER NOT NULL,
	username TEXT,
	first_name TEXT,
	avatar_url TEXT,
	created_at INTEGER
);
ALTER TABLE users ADD deleted_at INTEGER;
