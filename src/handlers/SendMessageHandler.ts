import { Num, OpenAPIRoute, OpenAPIRouteSchema, Str } from '@cloudflare/itty-router-openapi'
import jwt from '@tsndr/cloudflare-worker-jwt'
import { NewMessageRequest } from '~/types/ws/client-requests'
import { NewMessageEvent } from '~/types/ws/server-events'
import { AttachmentSchema } from '~/types/zod'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'

export class SendMessageHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    tags: ['messages'],
    summary: 'Send a message between users',
    requestBody: {
      chatId: new Str({ example: 'JC0TvKi3f2bIQtBcW1jIn' }),
      attachments: AttachmentSchema.optional().array(),
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
      const isValid = await jwt.verify(token, env.JWT_SECRET)
      if (!isValid) {
        return errorResponse('Unauthorized', 401)
      }
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
      const receiverDOId = env.USER_MESSAGING_DO.idFromName(chatId)
      const senderDO = env.USER_MESSAGING_DO.get(senderDOId)
      const receiverDO = env.USER_MESSAGING_DO.get(receiverDOId)

      // Create an event object with message details and timestamp
      const req: NewMessageRequest = {
        chatId,
        message,
        attachments,
      }
      const event: NewMessageEvent= {
        chatId: userId,
        message,
        attachments,
				userId
      }

      const reqBody = JSON.stringify(req)
      const headers = new Headers({ 'Content-Type': 'application/json' })
      const url = new URL(request.url)
      const storings: Promise<any>[] = [
        senderDO.fetch(
          new Request(`${url.origin}/${userId}/send`, {
            method: 'POST',
            body: reqBody,
            headers,
          }),
        ),
      ]
      if (chatId != '0' && chatId !== userId) {
        storings.push(
          receiverDO.fetch(
            new Request(`${url.origin}/${chatId}/receive`, {
              method: 'POST',
              body: JSON.stringify(event),
              headers,
            }),
          ),
        )
      }

      const [responseSender, responseReceiver] = await Promise.all(storings)
      // Return a success response
      return responseSender
    } catch (error) {
      console.error('SendMessageHandler Error:', error)
      return errorResponse('Failed to send message', 500)
    }
  }
}
