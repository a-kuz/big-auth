import { OpenAPIRoute, OpenAPIRouteSchema, Str, DataOf, Path } from '@cloudflare/itty-router-openapi'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'

export class UpdateContactHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    tags: ['contacts'],
    summary: 'Update a contact',
    parameters: { id: Path(Str) },
    requestBody: {
      clientId: new Str({ required: false }),
      userId: new Str({ required: false }),
      phoneNumber: new Str({ required: false }),
      userName: new Str({ required: false }),
      firstName: new Str({ required: false }),
      lastName: new Str({ required: false }),
      avatarUrl: new Str({ required: false }),
    },
    responses: {
      '200': {
        description: 'Contact updated successfully',
        schema: {
          id: new Str({ example: 'contactId' }),
        },
      },
      '400': {
        description: 'Bad Request',
      },
      '404': {
        description: 'Contact not found',
      },
      '500': {
        description: 'Internal Server Error',
      },
    },
  }

  async handle(request: Request, env: Env, _ctx: any, data: DataOf<typeof UpdateContactHandler.schema>) {
    try {
      const { id } = data.params
      const { clientId, userId, phoneNumber, userName, firstName, lastName, avatarUrl } = data.body
      const contact = { clientId, userId, phoneNumber, userName, firstName, lastName, avatarUrl }
      const result = await env.DB.prepare('UPDATE contacts SET clientId = ?, userId = ?, phoneNumber = ?, userName = ?, firstName = ?, lastName = ?, avatarUrl = ? WHERE id = ?')
        .bind(clientId, userId, phoneNumber, userName, firstName, lastName, avatarUrl, id)
        .run()
      if (result.changes === 0) {
        return errorResponse('Contact not found', 404)
      }
      return new Response(JSON.stringify({ id }), { status: 200 })
    } catch (error) {
      console.error(error)
      return errorResponse('Failed to update contact', 500)
    }
  }
}
