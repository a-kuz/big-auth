import { DataOf, OpenAPIRouteSchema, Query } from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import { userStorage } from '~/durable-objects/messaging/utils/mdo'
import { DialogSchema, GroupSchema } from '~/types/openapi-schemas/chat'
import { errorResponses } from '~/types/openapi-schemas/error-responses'
import { Route } from '~/utils/route'
import { writeErrorLog } from '~/utils/serialize-error'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'

export class GetChatHandler extends Route {
  static schema: OpenAPIRouteSchema = {
    summary: 'Retrieve chat info',
    tags: ['chats'],
    parameters: {
      chatId: Query(z.coerce.string(), { description: 'The ID of the chat' }),
    },
    responses: {
      '200': {
        description: 'Chat retrieved successfully',
        schema: z.union([GroupSchema, DialogSchema], {}),
      },
      ...errorResponses,
    },
    security: [{ BearerAuth: [] }],
  }

  async handle(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
    data: DataOf<typeof GetChatHandler.schema>,
  ): Promise<Response> {
    const user = env.user
    try {
      const {
        query: { chatId },
      } = data

      const userMessagingDO = userStorage(env, user.id)

      return userMessagingDO.fetch(
        new Request(`${env.ORIGIN}/${user.id}/client/request/chat`, {
          method: 'POST',
          body: JSON.stringify({ chatId }),
        }),
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ).then(response => {

        return response
      })
    } catch (error) {
      // Handle any errors
      writeErrorLog(error)

      return errorResponse('Something went wrong', 500)
    }
  }
}
