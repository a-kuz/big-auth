# User.ts

This file defines the `User` class and the `UserDB` type.

## User Class

The `User` class has the following properties:

- `id` (string): The unique identifier for the user.
- `phoneNumber` (number): The user's phone number. This is transformed to a string with a "+" prefix when converted to plain object.
- `username` (string, optional): The user's username.
- `firstName` (string, optional): The user's first name.
- `lastName` (string, optional): The user's last name.
- `avatarUrl` (string, optional): The URL of the user's avatar.
- `createdAt` (number, optional): The timestamp when the user was created.
- `deletedAt` (number, optional): The timestamp when the user was deleted.

The `User` class also has a static method `fromDb` that takes a `UserDB` object and returns a `User` instance.

## UserDB Type

The `UserDB` type is a transformation of the `User` class where the property names are converted from camelCase to snake_case. It has the following properties:

- `id` (string): The unique identifier for the user.
- `phone_number` (number): The user's phone number.
- `username` (string, optional): The user's username.
- `first_name` (string, optional): The user's first name.
- `last_name` (string, optional): The user's last name.
- `avatar_url` (string, optional): The URL of the user's avatar.
- `created_at` (number, optional): The timestamp when the user was created.
- `deleted_at` (number, optional): The timestamp when the user was deleted.