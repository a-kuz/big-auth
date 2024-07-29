import { Arr, DataOf, OpenAPIRoute, OpenAPIRouteSchema, Str } from '@cloudflare/itty-router-openapi'
import { Route } from '~/utils/route'
import { getContacts, getMergedContacts } from '../services/contacts'
import { getUserByToken } from '../services/get-user-by-token'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { errorResponses } from '../types/openapi-schemas/error-responses'
import { z } from 'zod'
import { digest } from '~/utils/digest'
import { normalizePhoneNumber } from '~/utils/normalize-phone-number'
import { putContacts } from '~/services/contacts'
import { UserMessagingDO } from '..'
import { userStorageById } from '~/durable-objects/messaging/utils/get-durable-object'
import { writeErrorLog } from '~/utils/serialize-error'

export class OnlinesHandler extends Route {
  static schema = {
    summary: 'who is online',
    tags: ['contacts'],
    requestBody: z.object({}),
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
      ...errorResponses,
    },
    security: [{ BearerAuth: [] }],
  }

  async handle(
    request: Request,
    env: Env,
    context: ExecutionContext,
    { body }: DataOf<typeof OnlinesHandler.schema>,
  ): Promise<Response> {
    try {
      const ownerId = env.user.id
      const contacts = await getMergedContacts(env)

      const onlineContacts = []

      for (const contact of contacts) {
        const contactStorage = userStorageById(env, contact.id as string)
        const response = await contactStorage.onlineStatus()

        console.log(
          `${contact.id} : ${response.status}${response.lastSeen ? `, last seen: ${response.lastSeen}` : ''}`,
        )

        onlineContacts.push({ contact, ...response })
      }

      return new Response(JSON.stringify({ users: onlineContacts }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    } catch (error) {
      await writeErrorLog(error)
      return errorResponse('Failed to find contacts')
    }
  }
}
