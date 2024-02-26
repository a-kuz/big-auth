# updateUser Service

The `updateUser` service is a function that updates a user's information in the database.

## Function Signature

```typescript
function updateUser(
  d1: D1Database,
  userId: string,
  updates: Partial<User>
): Promise<User>
```

## Parameters

- `d1`: An instance of the `D1Database` class. This is used to interact with the database.
- `userId`: A string representing the ID of the user to be updated.
- `updates`: An object containing the fields to be updated for the user. This object is of type `Partial<User>`, meaning it can have any subset of the properties of the `User` type.

## Return Value

The function returns a `Promise` that resolves to a `User` object. This object represents the updated user.

## Behavior

The function first converts the keys of the `updates` object from camel case to snake case using the `fromCamelToSnake` utility function. It then constructs an SQL update statement dynamically based on the provided updates.

The function prepares the values for the SQL statement, including the `userId` at the end, and executes the update statement.

After the update, the function retrieves the updated user from the database and returns it. If the user is not found after the update, an error is thrown.

If there is an error during the update process, the function logs the error and throws a new error with the message "Failed to update user".

## Dependencies

- `User` and `UserDB` from `../User`
- `fromCamelToSnake` from `../utils/name-сases`