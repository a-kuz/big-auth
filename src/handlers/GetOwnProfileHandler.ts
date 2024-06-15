import { OpenAPIRoute, OpenAPIRouteSchema, Str } from '@cloudflare/itty-router-openapi'
import { CustomError } from '~/errors/CustomError'
import { writeErrorLog } from '~/utils/serialize-error'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'

export class GetOwnProfileHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Get own profile',
    tags: ['profile'],
    operationId: 'own profile',
    responses: {
      '200': {
        description: 'Profile fetched successfully',
        schema: {
          id: new Str({ example: 'weEEwwecw_wdx2' }),
          phoneNumber: new Str({ example: '+79333333333' }),
          username: new Str({ required: false, example: '@ask_uznetsov' }),
          firstName: new Str({ required: false, example: 'Aleksandr' }),
          lastName: new Str({ required: false, example: 'Ivanov' }),
          avatarUrl: new Str({
            required: false,
            example: 'https://pics.png/png.png',
          }),
        },
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
