import { OpenAPIRoute, OpenAPIRouteSchema } from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import { getUserByToken } from '../services/get-user-by-token'
import { newId } from '../utils/new-id'
import { errorResponse } from '../utils/error-response'
import { Env } from '../types/Env'
import { GroupChatsDO } from '..'

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
      const authToken = request.headers.get('Authorization')?.split(' ')[1]
      if (!authToken) {
        return errorResponse('Authorization token is missing', 401)
      }

      const user = await getUserByToken(env.DB, authToken, env.JWT_SECRET)
      if (!user) {
        return errorResponse('Invalid or expired token', 401)
      }

      const { name, imgUrl, participants } = body

      if (!participants.includes(user.id)) {
        participants.push(user.id)
      }

      const groupId = newId(24)
      const doId = env.GROUP_CHATS_DO.idFromName(groupId)
      const groupChatDO = env.GROUP_CHATS_DO.get(doId)

      return new Response(
        JSON.stringify(await groupChatDO.createGroupChat(groupId, name, imgUrl, participants, user.id)),
      )
    } catch (error) {
      console.error('Error creating group chat:', error)
      return errorResponse('Internal server error', 500)
    }
  }
}
