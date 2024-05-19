import { Arr, OpenAPIRoute, OpenAPIRouteSchema, Path, Str } from '@cloudflare/itty-router-openapi'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { pushStorage } from '~/durable-objects/messaging/utils/mdo'

export class GetDeviceTokensHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Get device tokens for a user',
    tags: ['device'],
    parameters: {
      userId: Path(Str, { description: 'The ID of the user' }),
    },
    responses: {
      '200': {
        description: 'Device tokens retrieved successfully',
        schema: new Arr(new Str()),
      },
      '404': {
        description: 'User not found',
      },
      '500': {
        description: 'Internal Server Error',
      },
    },
  }

  async handle(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
    data: { params: { userId: string } },
  ): Promise<Response> {
    const { userId } = data.params

    try {
      const storage = pushStorage(env, userId)
      const tokens = await storage.getTokens()

      if (!tokens || tokens.length === 0) {
        return errorResponse('User not found or no device tokens available', 404)
      }

      return new Response(JSON.stringify(tokens), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      console.error('Failed to retrieve device tokens:', error)
      return errorResponse('Internal Server Error', 500)
    }
  }
}
