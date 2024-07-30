import {
  Arr,
  DataOf,
  jsonResp,
  Str
} from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import { putContacts } from '~/services/contacts'
import { digest } from '~/utils/digest'
import { normalizePhoneNumber } from '~/utils/normalize-phone-number'
import { Route } from '~/utils/route'
import { getUsersByPhoneNumbers } from '../db/services/get-user'
import { Env } from '../types/Env'
import { errorResponses } from '../types/openapi-schemas/error-responses'
import { errorResponse } from '../utils/error-response'

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
      if (!body.contacts.length) return new Response(JSON.stringify(body))
      let phoneBook: typeof body.contacts = body.contacts
        .filter(u => u.phoneNumber !== env.user.phoneNumber)
        .map(e => ({
          firstName: e.firstName,
          lastName: e.lastName,
          phoneNumber: normalizePhoneNumber(e.phoneNumber),
        }))
        .filter(({ phoneNumber }) => phoneNumber.length >= 6 || phoneNumber.startsWith('+9'))
        .toSorted(({ phoneNumber: a }, { phoneNumber: b }) => a.localeCompare(b))
      phoneBook = phoneBook.filter(
        (e, i) => phoneBook.findIndex(ee => ee.phoneNumber === e.phoneNumber) === i,
      )
      const stringPhoneBook = JSON.stringify(phoneBook)
      // console.log(stringPhoneBook)
      const hash = await digest(stringPhoneBook + Math.floor(Date.now() / 60000).toString())
      const cache = await caches.open('find-contacts')
      const cacheKey = new Request(request.url + '/' + hash, {
        headers: { 'Cache-Control': 'max-age=20' },
        method: 'GET',
      })
      const resp = await cache.match(cacheKey)
      console.log({ hash })
      if (resp) {
        console.log('CACHE')
        return resp
      }

      const users = await getUsersByPhoneNumbers(env.DB, phoneBook)
      await putContacts(env.user, phoneBook, users, env)
      const result = { contacts: users }

      context.waitUntil(Promise.all([cache.put(cacheKey, jsonResp(result))]))

      return jsonResp(result)
    } catch (error) {
      console.error(error)
      return errorResponse('Failed to find contacts')
    }
  }
}
