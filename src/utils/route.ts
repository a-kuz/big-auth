import { OpenAPIRoute, OpenAPIRouteSchema, jsonResp } from '@cloudflare/itty-router-openapi'
import { ZodError, z } from 'zod'

export class Route extends OpenAPIRoute {
  getSchema(): OpenAPIRouteSchema {
    return {}
  }
  handleValidationError(errors: z.ZodIssue[]): Response {
    return jsonResp(
      {
        error: new ZodError(errors).message,
        timestamp: Date.now(),
        status: 400,
      },
      {
        status: 400,
      },
    )
  }
}
