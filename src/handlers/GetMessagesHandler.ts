// File: /src/handlers/GetMessagesHandler.ts
import { OpenAPIRoute, OpenAPIRouteSchema, Query } from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import { GetMessagesRequest } from '~/types/ws/client-requests'
import { DialogMessageSchema, GroupChatMessageSchema } from '~/types/openapi-schemas/Messages'
import { getUserByToken } from '../services/get-user-by-token'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { userStorage } from '~/durable-objects/messaging/utils/mdo'

export class GetMessagesHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Retrieve messages for a chat',
    tags: ['messages'],

    parameters: {
      chatId: Query(z.coerce.string().optional(), { description: 'The ID of the chat' }),
      count: Query(z.coerce.number().max(500).default(50).optional(), {
        description: 'portion length',
      }),
      endId: Query(z.coerce.number().optional(), { description: 'to id' }),
    },
    responses: {
      '200': {
        description: 'Messages retrieved successfully',
        schema: z.union([z.array(DialogMessageSchema), z.array(GroupChatMessageSchema)], {
          description: 'Dialog or groupchat messages',
        }),
      },
      '400': {
        description: 'Bad Request',
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
    ctx: ExecutionContext,
    data: GetMessagesRequest,
  ): Promise<Response> {
    try {
      const url = new URL(request.url)
      const chatId = url.searchParams.get('chatId')
      if (!chatId) {
        return errorResponse('chatId parameter is required', 400)
      }
      let user

      try {
        // Authenticate the user
        user = await getUserByToken(
          env.DB,
          request.headers.get('Authorization')!.split(' ')[1],
          env.JWT_SECRET,
        )
      } catch (error) {}
      if (!user) {
        return errorResponse('Unauthorized', 401)
      }

      if (!user) {
        return errorResponse('Unauthorized', 401)
      }

      const userMessagingDO = userStorage(env, user.id)
      return userMessagingDO.fetch(
        new Request(`${env.ORIGIN}/${user.id}/client/request/messages`, {
          method: 'POST',
          body: JSON.stringify({ chatId }),
        }),
      )
    } catch (error) {
      console.error('Failed to retrieve messages:', error)
      return errorResponse('Internal Server Error', 500)
    }
  }
}
