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
    summary: 'Store device tokens with fingerprint (device id)',
    requestBody: z.object({
      deviceToken: z.string({ description: 'base64 encoded' }),
      tokenType: z.enum(['ios-notification', 'ios-voip']).default('ios-notification').optional(),
      fingerprint: z.string({ description: 'device id' }),
    }),
    responses: {
      200: { description: 'ok', schema: z.object({}) },
      ...errorResponses,
    },
  }

  async handle(
    request: Request,
    env: Env,
    _context: any,
    { body }: DataOf<typeof StoreDeviceTokenHandler.schema>,
  ) {
    const { deviceToken, fingerprint, tokenType = 'ios-notification' } = body

    const tokenStorage = fingerprintDO(env, fingerprint)
    await tokenStorage.setToken(fingerprint, tokenType, deviceToken)

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
}
