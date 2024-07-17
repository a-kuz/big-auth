import {
  DataOf,
  Num,
  Str
} from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import { AttachmentSchema } from '~/types/openapi-schemas/attachments'
import { NewMessageRequest } from '~/types/ws/client-requests'
import { Route } from '~/utils/route'
import { sendMessage } from '../services/send-message'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'

const requestBody = z.object({
  chatId: new Str({ example: 'JC0TvKi3f2bIQtBcW1jIn' }),
  attachments: z.optional(AttachmentSchema.array().optional()),
  message: new Str({ example: 'Hello, how are you?', required: false }),
  clientMessageId: new Str({ example: 'ldjkedlkedlk', required: false }),
	replyTo: new Num({ example: 1, required: false }),
})
export class SendMessageHandler extends Route {
  static schema = {
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

  async handle(request: Request, env: Env, _ctx: any, { body }: DataOf<typeof SendMessageHandler.schema>) {
    try {
      const response = await sendMessage(body as NewMessageRequest, env)
      return response
    } catch (error) {
      console.error('SendMessageHandler Error:', error)
      return errorResponse('Failed to send message', 500)
    }
  }
}
