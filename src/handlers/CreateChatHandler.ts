import { z } from 'zod'
import { groupStorage } from '~/durable-objects/messaging/utils/mdo'
import { CustomError } from '~/errors/CustomError'
import { Route } from '~/utils/route'
import { writeErrorLog } from '~/utils/serialize-error'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { newId } from '../utils/new-id'
import { errorResponses } from '~/types/openapi-schemas/error-responses'
import { GROUP_ID_LENGTH } from '~/durable-objects/messaging/constants'

// Define the OpenAPI schema for this route

export class CreateChatHandler extends Route {
  static schema = {
    tags: ['chats'],
    summary: 'Create a new chat group',
    requestBody: z.object({
      name: z.string(),
      imgUrl: z.string().optional(),
      participants: z.array(z.string()),
    }),
    responses: {
      200: {
        description: 'Group chat created successfully',

        contentType: 'application/json',
        schema: {
          groupId: z.string(),
          name: z.string(),
          imgUrl: z.string().optional(),
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
        return new Response(JSON.stringify(chat), {
          headers: {
            'Content-Type': 'application/json',
          },
        })
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
