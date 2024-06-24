import { OpenAPIRoute, OpenAPIRouteSchema, Str } from '@cloudflare/itty-router-openapi'
import { Route } from '~/utils/route'
import { CustomError } from '~/errors/CustomError'
import { writeErrorLog } from '~/utils/serialize-error'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { errorResponses } from '~/types/openapi-schemas/error-responses'
import { ProfileSchema } from '~/types/openapi-schemas/profile'


export class GetOwnProfileHandler extends Route {
  static schema: OpenAPIRouteSchema = {
    summary: 'Get own profile',
    tags: ['profile'],
    operationId: 'own profile',
    responses: {
      ...errorResponses,
      '200': {
        description: 'Profile fetched successfully',
        schema: ProfileSchema,
      },
    },

    security: [{ BearerAuth: [] }],
  }

  async handle(request: Request, env: Env, context: any, data: { id: string }) {
    try {
      const user = env.user

      return new Response(JSON.stringify(user.profile()), {
        status: 200,
      })
    } catch (e) {
      await writeErrorLog(e)
      return errorResponse(
        (e as Error).message ?? 'Something went wrong',
        (e as CustomError).httpCode || 500,
      )
    }
  }
}
