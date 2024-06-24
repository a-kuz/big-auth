import { Arr, OpenAPIRoute, OpenAPIRouteSchema, Str } from '@cloudflare/itty-router-openapi'
import { Route } from '~/utils/route'
import { getContacts } from '../services/contacts'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'

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
          }),
        },
      },
      '500': {
        description: 'Internal Server Error',
      },
    },
    security: [{ BearerAuth: [] }],
  }

  async handle(request: Request, env: Env, _ctx: any) {
    try {
      const ownerId = env.user.id
      const contacts = await getContacts(env, ownerId)
      return new Response(JSON.stringify({ contacts }), { status: 200 })
    } catch (error) {
      console.error(error)
      return errorResponse('Failed to retrieve contacts', 500)
    }
  }
}
