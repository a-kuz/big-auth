import { OpenAPIRoute, OpenAPIRouteSchema, DataOf } from '@cloudflare/itty-router-openapi'
import { Route } from '~/utils/route'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { z } from 'zod'
import { fingerprintDO } from '~/durable-objects/messaging/utils/mdo'
import { getUserByToken } from '~/services/get-user-by-token'
import { writeErrorLog } from '~/utils/serialize-error'
import { errorResponses } from '~/types/openapi-schemas/error-responses'

export class StoreDeviceTokenHandler extends Route {
  static schema = {
    tags: ['device'],
    summary: 'Store Apple device token with fingerprint',
    requestBody: z.object({
      deviceToken: z.string(),
      fingerprint: z.string(),
    }),
    responses: {
      200: { description: 'ok', schema: z.object({}) },
      ...errorResponses,
    },
    security: [{ BearerAuth: [] }],
  }

  async handle(
    request: Request,
    env: Env,
    _context: any,
    { body }: DataOf<typeof StoreDeviceTokenHandler.schema>,
  ) {
    const { deviceToken, fingerprint } = body

    const tokenStorage = fingerprintDO(env, fingerprint)
    await tokenStorage.setToken(fingerprint, deviceToken)

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
}
