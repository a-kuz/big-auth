import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
  Arr,
  Obj,
  Str,
  Enumeration,
  Bool,
  DateTime,
  Num,
  Query,
  DataOf,
} from '@cloudflare/itty-router-openapi'
import { getUserByToken } from '../services/get-user-by-token'
import { Env } from '../types/Env'
import { errorResponse, unauthorized } from '../utils/error-response'
import { userStorage } from '~/durable-objects/messaging/utils/mdo'
import { z } from 'zod'
import {
  ChatSchema,
  DialogSchema,
  GroupMetaSchema,
  GroupSchema,
} from '~/types/openapi-schemas/Chat'
import { writeErrorLog } from '~/utils/serialize-error'

export class GetChatHandler extends OpenAPIRoute {
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
      )
    } catch (error) {
      // Handle any errors
      writeErrorLog(error)

      return errorResponse('Something went wrong', 500)
    }
  }
}
