import { DataOf, OpenAPIRoute, Path, Str } from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import { userStorageById } from '~/durable-objects/messaging/utils/get-durable-object'
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
    const userMessagingDO = userStorageById(env, data.params.userId)

    ctx.waitUntil(userMessagingDO.blinkRequest())
    return jsonResp({})
  }
}
