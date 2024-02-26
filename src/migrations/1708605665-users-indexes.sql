
CREATE INDEX IF NOT EXISTS idx_users_phone_number_status ON users (phone_number, deleted_at);
CREATE INDEX IF NOT EXISTS idx_users_id_status ON users (id, deleted_at);
