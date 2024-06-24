import { OpenAPIRoute, OpenAPIRouteSchema, Str } from '@cloudflare/itty-router-openapi'
import { Route } from '~/utils/route'
import { getUserById } from '../db/services/get-user'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { errorResponses } from '../types/openapi-schemas/error-responses'

export class RefreshTokenHandler extends Route {
  static schema: OpenAPIRouteSchema = {
    summary: 'Refresh tokens',
    tags: ['auth'],
    requestBody: {
      refreshToken: new Str(),
    },
    responses: {
      '200': {
        description: 'ok',
        schema: {
          accessToken: new Str(),
          refreshToken: new Str(),
        },
      },
      ...errorResponses,
    },
    security: [],
  }

  async handle(request: Request, env: Env, _context: any, data: Record<string, any>) {
    try {
      const { refreshToken } = data.body
      const userId = refreshToken.split('.')[1]
      const user = await getUserById(env.DB, userId)

      const params = new URLSearchParams({
        userId: user.id,
        phoneNumber: user.phoneNumber,
        refreshToken,
      })

      const id = env.REFRESH_TOKEN_DO.idFromName(userId)
      const obj = env.REFRESH_TOKEN_DO.get(id)

      const url = new URL(request.url)

      return obj.fetch(
        new Request(`${url.origin}/refresh?${params.toString()}`, {
          method: 'POST',
        }),
      )
    } catch (error) {
      console.error(error)
      return errorResponse('Something went wrong')
    }
  }
}
