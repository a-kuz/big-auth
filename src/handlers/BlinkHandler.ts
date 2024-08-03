import { jsonResp, OpenAPIRoute } from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import { userStorageById } from '~/durable-objects/messaging/utils/get-durable-object'
import { Env } from '~/types/Env'
import { errorResponses } from '~/types/openapi-schemas/error-responses'

export class BlinkHandler extends OpenAPIRoute {
  static schema = {
    tags: ['Messaging'],
    summary: 'Blink - make all delivered',

    responses: {
      '200': { description: 'ok', schema: z.object({}) },
    },
    ...errorResponses,
    security: [
      {
        BearerAuth: [],
      },
    ],
  }

  async handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const userMessagingDO = userStorageById(env, env.user.id)

    ctx.waitUntil(userMessagingDO.blinkRequest())
    return jsonResp({})
  }
}
