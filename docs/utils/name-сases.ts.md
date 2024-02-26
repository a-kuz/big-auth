# `utils/name-сases.ts`

This file contains utility functions and types for converting object keys between snake case and camel case.

## Types

### `SnakeToCamelCase<S extends string>`

Converts a snake case string to camel case.

### `CamelToSnakeCase<S extends string>`

Converts a camel case string to snake case.

### `ObjectSnakeToCamelCase<T extends Record<string, any>>`

Converts the keys of an object from snake case to camel case.

### `ObjectCamelToSnakeCase<T extends Record<string, any>>`

Converts the keys of an object from camel case to snake case.

### `SnakeCased<T extends Record<string, any>>`

Converts the keys of an object to snake case.

## Functions

### `fromSnakeToCamel<T extends Record<string, any>>(obj: T): ObjectSnakeToCamelCase<T>`

Converts the keys of an object from snake case to camel case.

### `fromCamelToSnake<T extends Record<string, any>>(obj: T): ObjectCamelToSnakeCase<T>`

Converts the keys of an object from camel case to snake case.

## Usage Example

```typescript
const row = {
  id: "1",
  phone_number: 123456789,
  username: "john_doe",
  first_name: "John",
  last_name: "Doe",
  avatar_url: "https://example.com/avatar.jpg",
};

console.log(fromCamelToSnake(fromSnakeToCamel(row)));
console.log((fromSnakeToCamel(row)));
```

In the above example, `fromSnakeToCamel(row)` converts the keys of `row` from snake case to camel case, and `fromCamelToSnake(fromSnakeToCamel(row))` converts them back to snake case.