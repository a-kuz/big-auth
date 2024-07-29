import { DataOf, jsonResp, OpenAPIRouteSchema, Query } from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import { userStorageById } from '~/durable-objects/messaging/utils/get-durable-object'
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
    _request: Request,
    env: Env,
    _ctx: ExecutionContext,
    { query: { chatId } }: DataOf<typeof GetChatHandler.schema>,
  ): Promise<Response> {
    const user = env.user
    try {
      const userMessagingDO = userStorageById(env, user.id)

      const chatData = await userMessagingDO.chatRequest({ chatId })
      return jsonResp(chatData)
    } catch (error) {
      writeErrorLog(error)

      return errorResponse('Something went wrong', 500)
    }
  }
}
