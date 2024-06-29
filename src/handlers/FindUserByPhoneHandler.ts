import { OpenAPIRoute, OpenAPIRouteSchema, Query, Str } from '@cloudflare/itty-router-openapi'
import { Route } from '~/utils/route'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { errorResponses } from '../types/openapi-schemas/error-responses'
import { findUserByPhoneNumber } from '~/services/contacts'

export class FindUserByPhoneHandler extends Route {
  static schema: OpenAPIRouteSchema = {
    tags: ['contacts'],
    summary: 'Find user by phone number',
    parameters: {
      phoneNumber: Query(Str, { description: 'The phone number to search for' }),
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
      ...errorResponses,
    },
    security: [{ BearerAuth: [] }],
  }

  async handle(request: Request, env: Env, _ctx: any, data: { query: { phoneNumber: string } }) {
    try {
      const user = await findUserByPhoneNumber(env, data.query.phoneNumber)
      if (!user) {
        return errorResponse('User not found', 404)
      }
      return new Response(JSON.stringify(user), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    } catch (error) {
      console.error(error)
      return errorResponse('Failed to find user', 500)
    }
  }
}
