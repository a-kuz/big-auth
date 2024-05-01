import { Num, OpenAPIRoute, OpenAPIRouteSchema, Str } from '@cloudflare/itty-router-openapi'
import jwt from '@tsndr/cloudflare-worker-jwt'
import { NewMessageRequest } from '~/types/ws/client-requests'
import { AttachmentSchema } from '~/types/zod'
import { Env } from '../types/Env'
import { z } from 'zod'
import { errorResponse } from '../utils/error-response'

export class SendMessageHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    tags: ['messages'],
    summary: 'Send a message between users',
    requestBody: {
      chatId: new Str({ example: 'JC0TvKi3f2bIQtBcW1jIn' }),
      attachments: z.optional(AttachmentSchema.array().optional()),
      message: new Str({ example: 'Hello, how are you?' }),
    },

    responses: {
      '200': {
        description: 'Message sent successfully',
        schema: {
          messageId: new Num(),
          timestamp: new Num(),
        },
      },
      '400': {
        description: 'Bad Request',
      },
      '500': {
        description: 'Internal Server Error',
        schema: { message: new Str() },
      },
    },
    security: [{ BearerAuth: [] }],
  }

  async handle(request: Request, env: Env, _ctx: any, { body }: { body: NewMessageRequest }) {
    // Extract the Authorization header from the request
    const authorization = request.headers.get('Authorization')
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return errorResponse('Unauthorized', 401)
    }
    const token = authorization.substring(7)
    try {
      // Verify the JWT token
      const isValid = await jwt.verify(token, env.JWT_SECRET, { throwError: true })
    } catch {
      return errorResponse('Unauthorized', 401)
    }
    const decoded = jwt.decode(token)
    const userId = decoded?.payload?.sub
    if (!userId) {
      return errorResponse('Invalid sender', 400)
    }
    try {
      const { chatId, message, attachments = undefined } = body
      // Retrieve sender and receiver's durable object IDs
      const senderDOId = env.USER_MESSAGING_DO.idFromName(userId)
      const senderDO = env.USER_MESSAGING_DO.get(senderDOId)

      // Create an event object with message details and timestamp
      const req: NewMessageRequest = {
        chatId,
        message,
        attachments,
      }

      const reqBody = JSON.stringify(req)
      const headers = new Headers({ 'Content-Type': 'application/json' })
      const url = new URL(request.url)

      return senderDO.fetch(
        new Request(`${url.origin}/${userId}/send`, {
          method: 'POST',
          body: reqBody,
          headers,
        }),
      )
    } catch (error) {
      console.error('SendMessageHandler Error:', error)
      return errorResponse('Failed to send message', 500)
    }
  }
}
