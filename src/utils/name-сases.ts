export type SnakeToCamelCase<S extends string> =
  S extends `${infer T}_${infer U}`
    ? `${T}${Capitalize<SnakeToCamelCase<U>>}`
    : S;

export type CamelToSnakeCase<S extends string> =
  S extends `${infer T}${infer U}`
    ? U extends Uncapitalize<U>
      ? `${Lowercase<T>}${CamelToSnakeCase<U>}`
      : `${Lowercase<T>}_${CamelToSnakeCase<Uncapitalize<U>>}`
    : S;

export type ObjectSnakeToCamelCase<T extends Record<string, any>> = {
  [K in keyof T as SnakeToCamelCase<K & string>]: T[K];
};

export type ObjectCamelToSnakeCase<T extends Record<string, any>> = {
  [K in keyof T as CamelToSnakeCase<K & string>]: T[K];
};

export type SnakeCased<T extends Record<string, any>> = {
  [K in keyof T as CamelToSnakeCase<K & string>]: T[K];
};

export function fromSnakeToCamel<T extends Record<string, any>>(
  obj: T,
): ObjectSnakeToCamelCase<T> {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [
      key.replace(/(_\w)/g, (m) => m[1].toUpperCase()),
      value,
    ]),
  ) as ObjectSnakeToCamelCase<T>;
}

export function fromCamelToSnake<T extends Record<string, any>>(
  obj: T,
): ObjectCamelToSnakeCase<T> {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      value,
    ]),
  ) as ObjectCamelToSnakeCase<T>;
}

// // Пример использования
// const row = {
//   id: "1",
//   phone_number: 123456789,
//   username: "john_doe",
//   first_name: "John",
//   last_name: "Doe",
//   avatar_url: "https://example.com/avatar.jpg",
// };

// console.log(fromCamelToSnake(fromSnakeToCamel(row)));
// console.log((fromSnakeToCamel(row)));
