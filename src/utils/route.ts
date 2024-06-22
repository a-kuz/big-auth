import { OpenAPIRoute, jsonResp } from '@cloudflare/itty-router-openapi'
import { z } from 'zod'

export class Route extends OpenAPIRoute {
  handleValidationError(errors: z.ZodIssue[]): Response {
    return jsonResp(
      {
        error: JSON.stringify(errors),
        timestamp: Date.now(),
        status: 400,
      },
      {
        status: 400,
      },
    )
  }
}
