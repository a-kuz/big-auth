import { Arr, OpenAPIRoute, OpenAPIRouteSchema, Str } from '@cloudflare/itty-router-openapi'
import { getUserByPhoneNumbers } from '../db/services/get-user'
import { getUserByToken } from '../services/get-user-by-token'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'

export class FindContactsHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Find contacts by phone numbers',
    tags: ['contacts'],
    requestBody: {
      phoneNumbers: new Arr(new Str({ example: '+79333333333' })),
    },
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
    _context: any,
    data: { body: { phoneNumbers: string[] } },
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
        return new Response(JSON.stringify({ error: 'Failed to fetch profile' }), {
          status: 500,
        })
      }

      const contacts = await getUserByPhoneNumbers(env.DB, data.body.phoneNumbers)
      return new Response(JSON.stringify({ contacts }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    } catch (error) {
      console.error(error)
      return errorResponse('Failed to find contacts')
    }
  }
}
