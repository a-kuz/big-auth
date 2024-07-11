CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    client_id TEXT,
    user_id TEXT,
    phone_number TEXT,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    deleted_at INTEGER
);
