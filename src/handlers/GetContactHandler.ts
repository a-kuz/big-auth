import { OpenAPIRoute, OpenAPIRouteSchema, Path, Str } from '@cloudflare/itty-router-openapi'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'

export class GetContactHandler extends OpenAPIRoute {
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
          userName: new Str({ required: false }),
          firstName: new Str({ required: false }),
          lastName: new Str({ required: false }),
          avatarUrl: new Str({ required: false }),
        },
      },
      '404': {
        description: 'Contact not found',
      },
      '500': {
        description: 'Internal Server Error',
      },
    },
  }

  async handle(request: Request, env: Env, _ctx: any, data: DataOf<typeof GetContactHandler.schema>) {
    try {
      const { id } = data.params
      const contact = await env.DB.prepare('SELECT * FROM contacts WHERE id = ?').bind(id).first()
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
