# `utils/error-response.ts`

This module exports a single function `errorResponse`.

## `errorResponse(message: string, status = 500): Response`

This function takes in two parameters:

- `message` (string): The error message to be included in the response.
- `status` (number, optional): The HTTP status code to be used for the response. Defaults to `500`.

The function returns a `Response` object with the following properties:

- `status`: The HTTP status code.
- `headers`: An object with a single property `Content-Type` set to `application/json`.
- The body of the response is a JSON stringified object with a single property `error` set to the provided `message`.

### Example

```typescript
const response = errorResponse('An error occurred', 500);
```

In this example, `response` would be a `Response` object with a status of `500`, a `Content-Type` header set to `application/json`, and a body of `{"error": "An error occurred"}`.