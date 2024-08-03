import { jsonResp } from '@cloudflare/itty-router-openapi'

export const errorResponse = (message: string, status = 500): Response =>
  jsonResp({
    error: message,
    timestamp: Date.now(),
    status,
  })

export const unauthorized = (message = 'Unauthorized'): Response => errorResponse(message, 401)
