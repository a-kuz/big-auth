import { jsonResp } from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import { REGEX_URL_FILTER } from '~/constants'
import { GROUP_ID_LENGTH } from '~/durable-objects/messaging/constants'
import { groupStorage } from '~/durable-objects/messaging/utils/get-durable-object'
import { CustomError } from '~/errors/CustomError'
import { errorResponses } from '~/types/openapi-schemas/error-responses'
import { Route } from '~/utils/route'
import { writeErrorLog } from '~/utils/serialize-error'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { newId } from '../utils/new-id'

// Define the OpenAPI schema for this route

export class CreateChatHandler extends Route {
  static schema = {
    tags: ['chats'],
    summary: 'Create a new chat group',
    requestBody: z.object({
      name: z.string(),
      imgUrl: z
        .string()
        .min(1)
        .regex(REGEX_URL_FILTER, { message: 'url must be at iambig.ai' })
        .optional(),
      participants: z.array(z.string()),
    }),
    responses: {
      200: {
        description: 'Group chat created successfully',

        schema: {
          groupId: z.string(),
          name: z.string(),
          imgUrl: z.string(),
          participants: z.array(z.string()),
        },
      },

      ...errorResponses,
    },
    security: [
      {
        BearerAuth: [],
      },
    ],
  }

  // Main method to handle the POST /chats request
  async handle(
    request: Request,
    env: Env,
    _ctx: any,
    { body }: { body: { name: string; imgUrl: string; participants: string[] } },
  ) {
    try {
      const user = env.user

      const { name, imgUrl, participants } = body

      if (!participants.includes(user.id)) {
        participants.push(user.id)
      }

      const groupId = newId(GROUP_ID_LENGTH)
      const groupChatDO = groupStorage(env, groupId)
      try {
        const chat = await groupChatDO.createGroupChat(groupId, name, imgUrl, participants, user.id)
        return jsonResp(chat)
      } catch (error) {
        await writeErrorLog(error)
        return errorResponse(
          `Error creating group chat: ${(error as Error).message}`,
          (error as CustomError).httpCode ?? 500,
        )
      }
    } catch (error) {
      console.error('Error creating group chat:', error)
      return errorResponse('Internal server error', 500)
    }
  }
}
