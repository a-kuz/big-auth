# getUser Service

The `getUser` service is a function that retrieves a user from the database using their phone number. If the user does not exist, it creates a new user.

## Function Signature

```typescript
function getUser(d1: D1Database, phoneNumberStr: string): Promise<User>
```

## Parameters

- `d1`: An instance of `D1Database`. This is the database connection object.
- `phoneNumberStr`: A string representing the user's phone number.

## Return Value

Returns a `Promise` that resolves to a `User` object.

## Behavior

The function first converts the phone number string to an integer using the `phoneNumberToInt` utility function. It then attempts to retrieve a user from the database where the phone number matches the converted phone number and the user is not marked as deleted.

If a user is found, the function returns a `User` object created from the database record.

If no user is found, the function generates a new ID using the `newId` utility function, gets the current timestamp, and inserts a new user record into the database with these values. It then returns a new `User` object with the generated ID and phone number.

## Error Handling

If an error occurs during the database operations, the function logs the error to the console and throws a new error with the message "Failed to retrieve or insert user by phone number".

## Dependencies

- `User` and `UserDB` from `../User`
- `newId` from `../utils/new-id`
- `phoneNumberToInt` from `../utils/phone-number-to-int`