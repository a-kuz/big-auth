import {
  DataOf,
  Num,
  OpenAPIRoute,
  OpenAPIRouteSchema,
  Str,
  Uuid,
  inferData,
} from '@cloudflare/itty-router-openapi'
import jwt from '@tsndr/cloudflare-worker-jwt'
import { Schema, z } from 'zod'
import { NewMessageRequest } from '~/types/ws/client-requests'
import { AttachmentSchema } from '~/types/openapi-schemas/Attachments'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { newId } from '~/utils/new-id'
import { userStorage } from '~/durable-objects/messaging/utils/mdo'

const requestBody = {
  chatId: new Str({ example: 'JC0TvKi3f2bIQtBcW1jIn' }),
  attachments: z.optional(AttachmentSchema.array().optional()),
  message: new Str({ example: 'Hello, how are you?', required: false }),
  clientMessageId: new Str({ example: 'ldjkedlkedlk', required: false }),
}
export class SendMessageHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    tags: ['messages'],
    summary: 'Send a chat message ',

    requestBody,

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
        schema: { error: z.string(), status: z.string() },
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
      const { chatId, message, attachments = undefined, clientMessageId = '' } = body
      // Retrieve sender and receiver's durable object IDs

      const senderDO = userStorage(env, userId)
      // Create an event object with message details and timestamp
      const req: NewMessageRequest = {
        chatId,
        message,
        attachments,
        clientMessageId,
      }

      const reqBody = JSON.stringify(req)
      const headers = new Headers({ 'Content-Type': 'application/json' })
      const url = new URL(request.url)

      return senderDO.fetch(
        new Request(`${env.ORIGIN}/${userId}/client/request/new`, {
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
