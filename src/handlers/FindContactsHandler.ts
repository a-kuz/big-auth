import { Arr, DataOf, OpenAPIRoute, OpenAPIRouteSchema, Str } from '@cloudflare/itty-router-openapi'
import { Route } from '~/utils/route'
import { getUsersByPhoneNumbers } from '../db/services/get-user'
import { getUserByToken } from '../services/get-user-by-token'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { errorResponses } from '../types/openapi-schemas/error-responses'
import { z } from 'zod'
import { digest } from '~/utils/digest'
import { normalizePhoneNumber } from '~/utils/normalize-phone-number'
import { putContacts } from '~/services/contacts'

export class FindContactsHandler extends Route {
  static schema = {
    summary: 'Find contacts by phone numbers',
    tags: ['contacts'],
    requestBody: z.object({
      contacts: z.array(
        z.object({
          phoneNumber: new Str({ example: '+79333333333' }),

          firstName: new Str({ required: false, example: 'Aleksandr' }),
          lastName: new Str({ required: false, example: 'Ivanov' }),
        }),
      ),
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
      ...errorResponses,
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
      let phoneBook: typeof body.contacts = body.contacts
        .map(e => ({ ...e, phoneNumber: normalizePhoneNumber(e.phoneNumber) }))
      phoneBook = phoneBook.filter((e, i) => phoneBook.findIndex(ee => ee.phoneNumber === e.phoneNumber) === i)
        .filter(u => u.phoneNumber !== env.user.phoneNumber)
        .toSorted(({ phoneNumber: a }, { phoneNumber: b }) => a.localeCompare(b))

      const hash = await digest(JSON.stringify(phoneBook))
      const cache = await caches.open('find-contacts')
      const cacheKey = new Request(request.url + '/' + hash, {
        headers: { 'Cache-Control': 'max-age=20', ...request.headers },
        method: 'GET',
      })
      const resp = await cache.match(cacheKey)
      if (resp) return resp

      const contacts = await getUsersByPhoneNumbers(
        env.DB,
        phoneBook
      )
      const responseBody = JSON.stringify({ contacts })

      const response = new Response(responseBody, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
      await putContacts(env.user, phoneBook, contacts, env)
      context.waitUntil(
        Promise.all([
          cache.put(
            cacheKey,
            new Response(responseBody, {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
              },
            }),
          ),
        ]),
      )

      return response
    } catch (error) {
      console.error(error)
      return errorResponse('Failed to find contacts')
    }
  }
}
