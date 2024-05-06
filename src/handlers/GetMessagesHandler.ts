// File: /src/handlers/GetMessagesHandler.ts
import { OpenAPIRoute, OpenAPIRouteSchema, Query } from '@cloudflare/itty-router-openapi'
import { getUserByToken } from '../services/get-user-by-token'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { GetMessagesRequest } from '~/types/ws/client-requests'

export class GetMessagesHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Retrieve messages for a chat',
    tags: ['messages'],

    parameters: {
      chatId: Query('string', { description: 'The ID of the chat' }),
    },
    responses: {
      '200': {
        description: 'Messages retrieved successfully',
        schema: {
          messages: 'array',
        },
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

  async handle(request: Request, env: Env, ctx: ExecutionContext, data: GetMessagesRequest): Promise<Response> {
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

      const userMessagingDO = env.USER_MESSAGING_DO.get(env.USER_MESSAGING_DO.idFromName(user.id))
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
