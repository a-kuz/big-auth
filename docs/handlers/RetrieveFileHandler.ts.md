# RetrieveFileHandler

This handler is responsible for retrieving a file by its ID.

## Method

This handler is triggered by a GET request.

## Parameters

- `id` (path): The ID of the file to retrieve.

## Responses

- `200`: File retrieved successfully. The response headers include the file ID, ETag, and file name. The body of the response contains the file data.
- `400`: Bad Request. The error message is "id is required".
- `404`: File not found. The error message is "File not found".
- `500`: Server Error. The error message is "Failed to retrieve file" or "File metadata not found".

## Example

Request:

```
GET /files/{id}
```

Response:

```
200 OK
id: {id}
etag: {etag}
file-name: {file-name}
Content-Type: {content-type}

{file-data}
```

## Error Handling

If the file is not found, a 404 error is returned. If there is a server error while retrieving the file, a 500 error is returned.