export function errorResponse(message: string, status = 500): Response {
  // Constructing the error object with additional details
  const errorDetails = {
    error: message,
    timestamp: new Date().toISOString(),
    status,
  }

  return new Response(JSON.stringify(errorDetails), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function unauthorized(): Response {
  // Define the error message and status for unauthorized access
  const message = 'Unauthorized access'
  const status = 401

  // Call the errorResponse function with the unauthorized message and status
  return errorResponse(message, status)
}
