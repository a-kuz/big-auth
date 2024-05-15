import { Arr, DataOf, OpenAPIRoute, OpenAPIRouteSchema, Str } from '@cloudflare/itty-router-openapi'
import { getUserByPhoneNumbers } from '../db/services/get-user'
import { getUserByToken } from '../services/get-user-by-token'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { z } from 'zod'

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
      const authorization = request.headers.get('Authorization')
      const token = authorization?.split(' ')[1]

      if (!token) {
        return new Response(JSON.stringify({ error: 'Authorization required' }), {
          status: 401,
        })
      }

      try {
        const user = await getUserByToken(env.DB, token, env.JWT_SECRET)
        if (!user) {
          return errorResponse('user not exist', 401)
        }
      } catch (error) {
        console.error(error)
        return errorResponse('Failed to fetch profile', 401)
      }

      const phoneNumbers = body.phoneNumbers.filter((phoneNumber, i) => {
        return body.phoneNumbers.indexOf(phoneNumber) === i
      })
      const contacts = await getUserByPhoneNumbers(env.DB, phoneNumbers)
      const response = new Response(JSON.stringify({ contacts }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
      //await cache.put(request., response)
      return response
    } catch (error) {
      console.error(error)
      return errorResponse('Failed to find contacts')
    }
  }
}
