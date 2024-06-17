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
import { errorResponse } from '../utils/error-response'
import { userStorage } from '~/durable-objects/messaging/utils/mdo'
import { z } from 'zod'
import {
  ChatSchema,
  DialogSchema,
  GroupMetaSchema,
  GroupSchema,
} from '~/types/openapi-schemas/Chat'

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
      '401': {
        description: 'Unauthorized',
      },
      '500': {
        description: 'Internal Server Error',
      },
    },
    security: [{ BearerAuth: [] }],
  }

  async handle(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
    data: DataOf<typeof GetChatHandler.schema>,
  ): Promise<Response> {
    let user
    try {
      try {
        // Authenticate the user
        user = env.user
      } catch (error: Error | any) {
        console.error(error.message)
      }
      if (!user) {
        return errorResponse('Unauthorized', 401)
      }

      const { query } = data
      const { chatId } = query

      const userMessagingDO = userStorage(env, user.id)

      return userMessagingDO.fetch(
        new Request(`${env.ORIGIN}/${user.id}/client/request/chat`, {
          method: 'POST',
          body: JSON.stringify({ chatId }),
        }),
      )
    } catch (error) {
      // Handle any errors
      console.error('Failed to retrieve chats:', (error as Error).message)

      return errorResponse(JSON.stringify((error as Error).message), 500)
    }
  }
}
