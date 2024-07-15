import { DataOf, OpenAPIRoute, Path, Str } from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import { userStorage } from '~/durable-objects/messaging/utils/mdo'
import { Env } from '~/types/Env'
import { errorResponses } from '~/types/openapi-schemas/error-responses'

export class PublicBlinkHandler extends OpenAPIRoute {
  static schema = {
    tags: ['Messaging'],
    summary: 'Blink - make all delivered',
    parameters: { userId: Path(Str) },
    responses: {
      '200': { description: 'ok', schema: z.object({}) },
    },
    ...errorResponses,
    security: [{}],
  }

  async handle(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
    data: DataOf<typeof PublicBlinkHandler.schema>,
  ): Promise<Response> {
    const userMessagingDO = userStorage(env, data.params.userId)

    ctx.waitUntil(
      userMessagingDO
        .fetch(
          new Request(`${env.ORIGIN}/${data.params.userId}/client/request/blink`, {
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
