# Migration: 1708605665-users-indexes.sql

This migration file is responsible for creating indexes on the `users` table to optimize data retrieval. The following indexes are created:

## Index: idx_users_phone_number_status

This index is created on the `phone_number` and `deleted_at` columns of the `users` table.

```sql
CREATE INDEX IF NOT EXISTS idx_users_phone_number_status ON users (phone_number, deleted_at);
```

## Index: idx_users_id_status

This index is created on the `id` and `deleted_at` columns of the `users` table.

```sql
CREATE INDEX IF NOT EXISTS idx_users_id_status ON users (id, deleted_at);
```

These indexes will help to speed up queries that filter by `phone_number` or `id` and `deleted_at` status.