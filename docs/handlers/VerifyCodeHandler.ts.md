# VerifyCodeHandler

This handler is responsible for verifying the OTP (One Time Password) sent to the user's phone number.

## Request

The request body should contain the following parameters:

- `phoneNumber`: The phone number to which the OTP was sent. It should be a string. Example: "+34627068478"
- `code`: The OTP that was sent to the user's phone number. It should be a string. Example: "000000"

## Response

The response from this handler can be one of the following:

### Success Response

If the OTP verification is successful, the response will have a status code of `200` and the following body:

- `token`: A JWT token for the authenticated user. Example: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJGLXl1Z01uN1A1d0RNYmpjcGVaN1AiLCJwaG9uZSI6MzQ2MjcwNjg0NzgsIm5iZiI6MTcwODgxNzY0OSwiZXhwIjoxNzExNDA5NjQ5LCJpYXQiOjE3MDg4MTc2NDl9.FAqILei0iXB0lAZP41hUYZTnLZcHQX2O560P9YM4QGQ"

### Error Response

If the OTP verification fails, the response will have a status code of `400` and the following body:

- `message`: A string indicating the error. Example: "code is incorrect"

## Methods

### `handle`

This method handles the incoming request for OTP verification. It takes the following parameters:

- `_request`: The incoming request object.
- `env`: The environment variables.
- `_context`: The context of the request.
- `data`: The data from the request body.

### `verifyCodeWithTwilio`

This method verifies the OTP with Twilio. It takes the following parameters:

- `phoneNumber`: The phone number to which the OTP was sent.
- `code`: The OTP that was sent to the user's phone number.
- `env`: The environment variables.

It returns a promise that resolves to a string indicating the status of the OTP verification. The status can be one of the following:

- `"pending"`: The OTP verification is still in progress.
- `"approved"`: The OTP verification was successful.
- Any other string: The OTP verification failed.