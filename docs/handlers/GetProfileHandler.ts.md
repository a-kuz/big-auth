# GetProfileHandler

This handler is responsible for fetching the user profile.

## Method

This handler responds to HTTP GET requests.

## URL

The handler is bound to the `/profile` route.

## Authorization

Requests to this handler must include a `Bearer` token in the `Authorization` header.

## Responses

### 200 OK

The handler responds with a 200 status code when the profile is fetched successfully. The response body includes the following fields:

- `id`: A string that represents the user's unique identifier. Example: "weEEwwecw_wdx2"
- `phoneNumber`: A string that represents the user's phone number. Example: "+79333333333"
- `username`: An optional string that represents the user's username. Example: "@ask_uznetsov"
- `firstName`: An optional string that represents the user's first name. Example: "Aleksandr"
- `lastName`: An optional string that represents the user's last name. Example: "Ivanov"
- `avatarUrl`: An optional string that represents the URL of the user's avatar. Example: "https://pics.png/png.png"

### 401 Unauthorized

The handler responds with a 401 status code when the `Authorization` header is missing or invalid. The response body includes an `error` field with the value "Authorization required".

### 404 Not Found

The handler responds with a 404 status code when the user associated with the provided token is not found. The response body includes an `error` field with the value "User not found".

### 500 Internal Server Error

The handler responds with a 500 status code when an error occurs while fetching the profile. The response body includes an `error` field with the value "Failed to fetch profile".