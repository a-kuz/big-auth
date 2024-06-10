import { OpenAPIRoute, OpenAPIRouteSchema, Path, Str } from '@cloudflare/itty-router-openapi'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'

export class DeleteContactHandler extends OpenAPIRoute {
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
  }

  async handle(request: Request, env: Env, _ctx: any, data: DataOf<typeof DeleteContactHandler.schema>) {
    try {
      const { id } = data.params
      const result = await env.DB.prepare('DELETE FROM contacts WHERE id = ?').bind(id).run()
      if (result.changes === 0) {
        return errorResponse('Contact not found', 404)
      }
      return new Response(JSON.stringify({ id }), { status: 200 })
    } catch (error) {
      console.error(error)
      return errorResponse('Failed to delete contact', 500)
    }
  }
}
