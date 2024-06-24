import {
  DataOf,
  OpenAPIRoute,
  OpenAPIRouteSchema,
  Path,
  Str,
} from '@cloudflare/itty-router-openapi'
import { Route } from '~/utils/route'
import { Env } from '../types/Env'
import { getContactById } from '../services/contacts'
import { errorResponse } from '../utils/error-response'
import { errorResponses } from '../types/openapi-schemas/error-responses'

export class GetContactHandler extends Route {
  static schema: OpenAPIRouteSchema = {
    tags: ['contacts'],
    summary: 'Get a contact by ID',
    parameters: { id: Path(Str) },
    responses: {
      '200': {
        description: 'Contact retrieved successfully',
        schema: {
          id: new Str(),
          clientId: new Str({ required: false }),
          userId: new Str({ required: false }),
          phoneNumber: new Str({ required: false }),
          username: new Str({ required: false }),
          firstName: new Str({ required: false }),
          lastName: new Str({ required: false }),
          avatarUrl: new Str({ required: false }),
        },
      },
      '404': {
        description: 'Contact not found',
      },
      ...errorResponses,
    },
    security: [{ BearerAuth: [] }],
  }

  async handle(
    request: Request,
    env: Env,
    _ctx: any,
    data: DataOf<typeof GetContactHandler.schema>,
  ) {
    try {
      const { id } = data.params
      const ownerId = env.user.id
      const contact = await getContactById(env, id, ownerId)
      if (!contact) {
        return errorResponse('Contact not found', 404)
      }
      return new Response(JSON.stringify(contact), { status: 200 })
    } catch (error) {
      console.error(error)
      return errorResponse('Failed to retrieve contact', 500)
    }
  }
}
