# JWT Service

This service is responsible for generating access and refresh tokens.

## Functions

### generateAccessToken(user: Pick<User, 'phoneNumber' | 'id'>, secret: string)

This function generates an access token for a user.

#### Parameters

- `user`: An object containing the user's phone number and id.
- `secret`: A string used for signing the token.

#### Returns

A Promise that resolves to a string representing the access token.

### generateRefreshToken()

This function generates a refresh token.

#### Returns

A Promise that resolves to a string representing the refresh token.