import { OpenAPIRoute, OpenAPIRouteSchema } from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import { groupStorage } from '~/durable-objects/messaging/utils/mdo'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { newId } from '../utils/new-id'
import { writeErrorLog } from '~/utils/serialize-error'
import { CustomError } from '~/errors/CustomError'

// Define the request schema using Zod
const createChatSchema = z.object({
  name: z.string(),
  imgUrl: z.string().optional(),
  participants: z.array(z.string()),
})

// Define the OpenAPI schema for this route
export class CreateChatHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    tags: ['chats'],
    summary: 'Create a new chat group',
    requestBody: createChatSchema,
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

      401: {
        description: 'Unauthorized',
      },
      500: {
        description: 'Internal server error',
      },
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
      if (!user) {
        return errorResponse('User not found in environment', 401)
      }

      const { name, imgUrl, participants } = body

      if (!participants.includes(user.id)) {
        participants.push(user.id)
      }

      const groupId = newId(24)
      const groupChatDO = groupStorage(env, groupId)
      try {
        const chat = await groupChatDO.createGroupChat(groupId, name, imgUrl, participants, user.id)
        return new Response(JSON.stringify(chat))
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
