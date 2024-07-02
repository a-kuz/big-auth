import { OpenAPIRoute } from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import { userStorage } from '~/durable-objects/messaging/utils/mdo'
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
    const userMessagingDO = userStorage(env, env.user.id)

    ctx.waitUntil(
      userMessagingDO
        .fetch(
          new Request(`${env.ORIGIN}/${env.user.id}/client/request/blink`, {
            method: 'POST',
            body: '{}',
          }),
        )
        .then(response => {
          return response
        }),
    )
    return new Response()
  }
}
