import { OpenAPIRoute, OpenAPIRouteSchema, Str } from '@cloudflare/itty-router-openapi'
import { decode, verify } from '@tsndr/cloudflare-worker-jwt'
import { instanceToPlain } from 'class-transformer'
import { getUserById } from '../db/services/get-user'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { getUserByToken } from '../services/get-user-by-token'
import { UnauthorizedError } from '~/errors/UnauthorizedError'
import { CustomError } from "~/errors/CustomError"

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
    const user = env.user
      if (!user) {
        return errorResponse('Unauthorized', 401)
      }

      return new Response(JSON.stringify(user.profile()), {
        status: 200,
      })
    } catch (e) {
      console.error(e)
      return errorResponse((e as Error).message ?? 'Something went wrong', (e as CustomError).httpCode || 500)
    }
  }
