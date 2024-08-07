// File: /src/handlers/GetMessagesHandler.ts
import { DataOf, jsonResp, Query } from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import { userStorageById } from '~/durable-objects/messaging/utils/get-durable-object'
import { DialogMessageSchema, GroupChatMessageSchema } from '~/types/openapi-schemas/messages'
import { errorResponses } from '~/types/openapi-schemas/error-responses'
import { Route } from '~/utils/route'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { ProfileSchema } from '~/types/openapi-schemas/profile'
import { DEFAULT_PORTION, MAX_PORTION } from '~/durable-objects/messaging/constants'

export class GetMessagesHandler extends Route {
  static schema = {
    summary: 'Retrieve messages for a chat',
    tags: ['messages'],

    parameters: {
      chatId: Query(z.coerce.string(), { description: 'The ID of the chat' }),
      count: Query(z.coerce.number().max(MAX_PORTION).default(DEFAULT_PORTION).optional(), {
        description: 'portion length',
      }),
      endId: Query(z.coerce.number().optional(), { description: 'to id' }),
      startId: Query(z.coerce.number().optional(), { description: 'from id' }),
    },
    responses: {
      '200': {
        description: 'Messages retrieved successfully',
        schema: z.object({
          messages: z.union([z.array(DialogMessageSchema), z.array(GroupChatMessageSchema)], {
            description: 'Dialog or groupchat messages',
          }),
        }),
        authors: z.array(ProfileSchema),
      },
      ...errorResponses,
    },
    security: [{ BearerAuth: [] }],
  }

  async handle(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
    data: DataOf<typeof GetMessagesHandler.schema>,
  ): Promise<Response> {
    try {
      const { chatId, count = undefined, endId = undefined, startId = undefined } = data.query

      let user = env.user
      const userMessagingDO = userStorageById(env, user.id)
      const messages = await userMessagingDO.messagesRequest({ chatId, count, endId, startId })
      return jsonResp(messages)
    } catch (error) {
      console.error('Failed to retrieve messages:', error)
      return errorResponse('Internal Server Error', 500)
    }
  }
}
