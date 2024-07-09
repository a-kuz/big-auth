import { Arr, Bool, OpenAPIRouteSchema, Str } from '@cloudflare/itty-router-openapi'
import { Route } from '~/utils/route'
import { getContacts } from '../services/contacts'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { verify } from 'crypto'
import { errorResponses } from '~/types/openapi-schemas/error-responses'

export class GetContactsHandler extends Route {
  static schema: OpenAPIRouteSchema = {
    tags: ['contacts'],
    summary: 'Get all contacts',
    responses: {
      '200': {
        description: 'Contacts retrieved successfully',
        schema: {
          contacts: new Arr({
            id: new Str(),
            clientId: new Str({ required: false }),
            userId: new Str({ required: false }),
            phoneNumber: new Str({ required: false }),
            username: new Str({ required: false }),
            firstName: new Str({ required: false }),
            lastName: new Str({ required: false }),
            avatarUrl: new Str({ required: false }),
						verified: new Bool({ required: false }),
          }),
        },
      },
      ...errorResponses
    },
    security: [{ BearerAuth: [] }],
  }

  async handle(request: Request, env: Env, _ctx: any) {
    try {
      const ownerId = env.user.id
      const contacts = await getContacts(env, ownerId)
      return new Response(JSON.stringify({ contacts }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    } catch (error) {
      console.error(error)
      return errorResponse('Failed to retrieve contacts', 500)
    }
  }
}
