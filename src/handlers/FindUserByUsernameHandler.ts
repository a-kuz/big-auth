import {
  DataOf,
  OpenAPIRoute,
  OpenAPIRouteSchema,
  Query,
  Str,
} from '@cloudflare/itty-router-openapi'
import { Route } from '~/utils/route'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { findUserByUsername } from '../services/contacts'
import { z } from 'zod'

export class FindUserByUsernameHandler extends Route {
  static schema = {
    tags: ['contacts'],
    summary: 'Find user by username',
    requestBody: z.object({
      username: new Str({ example: 'akuz', required: true }),
    }),
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

  async handle(
    request: Request,
    env: Env,
    _ctx: any,
    data: DataOf<typeof FindUserByUsernameHandler.schema>,
  ) {
    try {
      const user = await findUserByUsername(env, data.body.username)
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
