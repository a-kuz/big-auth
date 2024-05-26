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
import { sendMessage } from '../services/send-message'

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
    try {
      return sendMessage(body, env)
    } catch (error) {
      console.error('SendMessageHandler Error:', error)
      return errorResponse('Failed to send message', 500)
    }
  }
}
