import { OpenAPIRoute, OpenAPIRouteSchema, DataOf } from '@cloudflare/itty-router-openapi'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { z } from 'zod'
import { pushStorage } from '~/durable-objects/messaging/utils/mdo'
import { getUserByToken } from '~/services/get-user-by-token'
import { serializeError } from 'serialize-error'

export class StoreDeviceTokenHandler extends OpenAPIRoute {
  static schema = {
    tags: ['device'],
    summary: 'Store Apple device token with fingerprint',
    requestBody: z.object({
      deviceToken: z.string(),
      fingerprint: z.string(),
    }),
    responses: {
      '200': {
        description: 'Device token stored successfully',
      },
      '400': {
        description: 'Bad request',
      },
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
    const authorization = request.headers.get('Authorization')
    const token = authorization?.split(' ')[1]

    if (!token) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
      })
    }
    let user
    try {
      user = await getUserByToken(env.DB, token, env.JWT_SECRET)
      if (!user) {
        return errorResponse('user not exist', 401)
      }
    } catch (error) {
      console.error(serializeError(error))
      return errorResponse('Failed to fetch profile', 401)
    }
    const userId = user.id
    try {
      const push = pushStorage(env, userId)
      await push.setToken(userId, fingerprint, deviceToken)

      return new Response(JSON.stringify({ message: 'Device token stored successfully' }), {
        status: 200,
      })
    } catch (error) {
      console.error(serializeError(error))
      return errorResponse('Failed to store device token', 500)
    }
  }
}
