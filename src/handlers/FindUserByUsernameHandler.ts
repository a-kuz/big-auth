import { OpenAPIRoute, OpenAPIRouteSchema, Query, Str } from '@cloudflare/itty-router-openapi'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { findUserByUsername } from '../services/contacts'

export class FindUserByUsernameHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    tags: ['contacts'],
    summary: 'Find user by username',
    parameters: {
      username: Query(Str, { description: 'The username to search for' }),
    },
    responses: {
      '200': {
        description: 'User found',
        schema: {
          id: new Str(),
          username: new Str(),
          phoneNumber: new Str(),
          firstName: new Str({ required: false }),
          lastName: new Str({ required: false }),
          avatarUrl: new Str({ required: false }),
        },
      },
      '404': {
        description: 'User not found',
      },
      '500': {
        description: 'Internal Server Error',
      },
    },
    security: [{ BearerAuth: [] }],
  }

  async handle(request: Request, env: Env, _ctx: any, data: { query: { username: string } }) {
    try {
      const user = await findUserByUsername(env, data.query.username)
      if (!user) {
        return errorResponse('User not found', 404)
      }
      return new Response(JSON.stringify(user), { status: 200 })
    } catch (error) {
      console.error(error)
      return errorResponse('Failed to find user', 500)
    }
  }
}
