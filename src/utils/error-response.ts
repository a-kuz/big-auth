export function errorResponse(message: string, status = 500): Response {
	// Constructing the error object with additional details
	const errorDetails = {
		error: message,
		timestamp: new Date().toISOString(),
		status
	};

	// Returning a new Response object with the error details, status code, and setting the Content-Type header to application/json
	return new Response(JSON.stringify(errorDetails), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}