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
} from '@cloudflare/itty-router-openapi'
import { getUserByToken } from '../services/get-user-by-token'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { userStorage } from '~/durable-objects/messaging/utils/mdo'
import { serializeError } from 'serialize-error'

export class GetChatsHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Retrieve chat messages',
    tags: ['chats'],
    responses: {
      '200': {
        description: 'Chat messages retrieved successfully',
        schema: {
          chats: new Arr(
            new Obj({
              type: new Enumeration({
                values: ['dialog', 'group', 'channel', 'favorites'],
                example: 'dialog',
              }),
              id: new Str({ example: 'JC0TvKi3f2bIQtBcW1jIn' }),
              photoUrl: new Str({
                required: false,
                example: 'https://dev.iambig.ai/public/gb24ixCWLL25S-jtzYck7',
              }),
              name: new Str({ example: 'Серёжа' }),
              lastMessageText: new Str({ example: 'Hi' }),
              lastMessageTime: new Num({ example: 1710436789 }),
              lastMessageAuthor: new Str({
                required: false,
                example: 'Серёжа',
              }),
              lastMessageStatus: new Enumeration({
                values: ['read', 'unread', 'undelivered'],
              }),
              missed: new Num({
                required: false,
                example: 1,
                description: 'missed messages count',
              }),
              verified: new Bool({ required: false }),
            }),
          ),
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

  async handle(request: Request, env: Env): Promise<Response> {
    try {
      const userMessagingDO = userStorage(env, env.user.id)

      const url = new URL(request.url)

      return userMessagingDO.fetch(
        new Request(`${url.origin}/${env.user.id}/client/request/chats`, {
          method: 'POST',
          body: '{}',
        }),
      )
    } catch (error: unknown) {
      // Handle any errors
      console.error('Failed to retrieve chats:', serializeError(error))

      return errorResponse(JSON.stringify((error as Error).message), 500)
    }
  }
}
