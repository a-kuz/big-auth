import {
  Arr,
  Bool,
  Enumeration,
  jsonResp,
  Num,
  Obj,
  OpenAPIRoute,
  OpenAPIRouteSchema,
  Str,
} from '@cloudflare/itty-router-openapi'
import { Route } from '~/utils/route'
import { userStorageById } from '~/durable-objects/messaging/utils/get-durable-object'
import { writeErrorLog } from '~/utils/serialize-error'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { errorResponses } from '../types/openapi-schemas/error-responses'

export class GetChatsHandler extends Route {
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
      ...errorResponses,
    },
    security: [{ BearerAuth: [] }],
  }

  async handle(request: Request, env: Env): Promise<Response> {
    try {
      const userMessagingDO = userStorageById(env, env.user.id)

      
      const chats = await userMessagingDO.getChatsRequest({})
      return jsonResp(chats)
    } catch (error: unknown) {
      // Handle any errors
      writeErrorLog(error)

      return errorResponse(JSON.stringify((error as Error).message), 500)
    }
  }
}
