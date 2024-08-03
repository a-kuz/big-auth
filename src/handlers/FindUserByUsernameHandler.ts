import {
  DataOf,
  jsonResp,
  Str
} from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import { errorResponses } from '~/types/openapi-schemas/error-responses'
import { ProfileSchema } from '~/types/openapi-schemas/profile'
import { Route } from '~/utils/route'
import { findUserByUsername } from '../services/contacts'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'

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
        schema: ProfileSchema,
      },
      '404': {
        description: 'User not found',
      },
      ...errorResponses
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
      return jsonResp(user)
    } catch (error) {
      console.error(error)
      return errorResponse('Failed to find user', 500)
    }
  }
}
