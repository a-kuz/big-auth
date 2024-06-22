import { Arr, DataOf, OpenAPIRoute, OpenAPIRouteSchema, Str } from '@cloudflare/itty-router-openapi'
import { getUserByPhoneNumbers } from '../db/services/get-user'
import { getUserByToken } from '../services/get-user-by-token'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { z } from 'zod'
import { digest } from '~/utils/digest'
import { normalizePhoneNumber } from '~/utils/normalize-phone-number'
import { putContacts } from '~/services/contacts'

export class FindContactsHandler extends OpenAPIRoute {
  static schema = {
    summary: 'Find contacts by phone numbers',
    tags: ['contacts'],
    requestBody: z.object({
      phoneNumbers: z.array(z.string().startsWith('+').openapi({ example: '+99990123443' })),
    }),
    responses: {
      '200': {
        description: 'Contacts found',
        schema: {
          contacts: new Arr({
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
    security: [{ BearerAuth: [] }],
  }

  async handle(
    request: Request,
    env: Env,
    context: ExecutionContext,
    { body }: DataOf<typeof FindContactsHandler.schema>,
  ) {
    try {
      let phoneNumbers = body.phoneNumbers.map(normalizePhoneNumber)

      phoneNumbers = phoneNumbers
        .filter((phoneNumber, i) => phoneNumbers.indexOf(phoneNumber) === i)
        .filter(u => u !== env.user.phoneNumber)
        .toSorted((a, b) => a.localeCompare(b))

      const hash = await digest(JSON.stringify(phoneNumbers))
      const cache = await caches.default
      const cacheKey = new Request(request.url + '/' + hash, {
        headers: { 'Cache-Control': 'max-age=20' },
      })
      const resp = await cache.match(cacheKey)
      if (resp) return resp

      const contacts = (await getUserByPhoneNumbers(env.DB, phoneNumbers)).filter(
        u => u.id !== env.user.id,
      )
      const responseBody = JSON.stringify({ contacts })

      const response = new Response(responseBody, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })

      context.waitUntil(
        Promise.all([
          putContacts(env.user, phoneNumbers, contacts, env),
          cache.put(cacheKey, response),
        ]),
      )

      return response
    } catch (error) {
      console.error(error)
      return errorResponse('Failed to find contacts')
    }
  }
}
