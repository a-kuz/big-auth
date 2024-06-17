import { Arr, DataOf, OpenAPIRoute, OpenAPIRouteSchema, Str } from '@cloudflare/itty-router-openapi'
import { getUserByPhoneNumbers } from '../db/services/get-user'
import { getUserByToken } from '../services/get-user-by-token'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { z } from 'zod'
import { digest } from '~/utils/digest'
import { normalizePhoneNumber } from '~/utils/normalize-phone-number'
import { putContacts } from '~/services/contacts'
import { UserMessagingDO } from '..'
import { userStorage } from '~/durable-objects/messaging/utils/mdo'

export class OnlinesHandler extends OpenAPIRoute {
  static schema = {
    summary: 'Find contacts by phone numbers',
    tags: ['contacts'],
    requestBody: z.object({
      phoneNumbers: z
        .array(z.string().startsWith('+').openapi({ example: '+99990123443' }))
        .optional(),
    }),
    responses: {
      '200': {
        description: 'Ok',
        schema: {
          users: new Arr({
            id: new Str(),
            phoneNumber: new Str(),
            username: new Str({ required: false }),
            firstName: new Str({ required: false }),
            lastName: new Str({ required: false }),
            avatarUrl: new Str({ required: false }),
          }),
        },
      },
      '400': {
        description: 'Bad Request',
      },
      '500': {
        description: 'Server Error',
      },
    },
    security: [{}],
  }

  async handle(
    request: Request,
    env: Env,
    context: ExecutionContext,
    { body }: DataOf<typeof OnlinesHandler.schema>,
  ) {
    try {
      // const t =userStorage(env).lis
      // const contacts = (await getUserByPhoneNumbers(env.DB, phoneNumbers)).filter(
      //   u => u.id !== env.user.id,
      // )
      // const responseBody = JSON.stringify({ contacts })

      const response = new Response('', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })

      return response
    } catch (error) {
      console.error(error)
      return errorResponse('Failed to find contacts')
    }
  }
}
