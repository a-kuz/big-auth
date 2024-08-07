import { DataOf, jsonResp, Path, Str } from '@cloudflare/itty-router-openapi'
import { getUserById } from '~/db/services/get-user'
import { NotFoundError } from '~/errors/NotFoundError'
import { errorResponses } from '~/types/openapi-schemas/error-responses'
import { ProfileSchema } from '~/types/openapi-schemas/profile'
import { Route } from '~/utils/route'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'

export class GetProfileHandler extends Route {
  static schema = {
    summary: 'Get user profile',
    operationId: 'user profule',
    tags: ['contacts'],
    parameters: { id: Path(Str) },
    responses: {
      '200': {
        description: 'Profile fetched successfully',
        schema: ProfileSchema,
      },
      ...errorResponses,
    },
    security: [{ BearerAuth: [] }],
  }

  async handle(
    request: Request,
    env: Env,
    context: any,
    data: DataOf<typeof GetProfileHandler.schema>,
  ) {
    try {
      
      const user = env.user.id === data.params.id ? env.user : await getUserById(env.DB, data.params.id, new NotFoundError(), 'get-profile-handler')
      if (!user) {
        return errorResponse('User not found', 404)
      }

      const userProfile = user.profile()

      return jsonResp(userProfile)
    } catch (error) {
      console.error(error)
      return errorResponse('Failed to fetch profile', 500)
    }
  }
}
