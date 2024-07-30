import {
  DataOf,
  jsonResp,
  OpenAPIRoute,
  OpenAPIRouteSchema,
  Path,
  Str,
} from '@cloudflare/itty-router-openapi'
import { Route } from '~/utils/route'
import { Env } from '../types/Env'
import { deleteContact } from '../services/contacts'
import { errorResponse } from '../utils/error-response'

export class DeleteContactHandler extends Route {
  static schema: OpenAPIRouteSchema = {
    tags: ['contacts'],
    summary: 'Delete a contact by ID',
    parameters: { id: Path(Str) },
    responses: {
      '200': {
        description: 'Contact deleted successfully',
        schema: {
          id: new Str(),
        },
      },
      '404': {
        description: 'Contact not found',
      },
      '500': {
        description: 'Internal Server Error',
      },
    },
    security: [{ BearerAuth: [] }],
  }
  async handle(
    request: Request,
    env: Env,
    _ctx: any,
    data: DataOf<typeof DeleteContactHandler.schema>,
  ) {
    try {
      const { id } = data.params
      const ownerId = env.user.id
      const success = await deleteContact(env, id, ownerId)
      if (!success) {
        return errorResponse('Contact not found', 404)
      }
      return jsonResp({ id })
    } catch (error) {
      console.error(error)
      return errorResponse('Failed to delete contact', 500)
    }
  }
}
