import { OpenAPIRoute, OpenAPIRouteSchema, Path, Str } from '@cloudflare/itty-router-openapi'
import { Env } from '../types/Env'
import { getUserById } from '../db/services/get-user' // import function to fetch user details from DB
import { errorResponse } from '../utils/error-response'

export class GetAvatarHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Get user avatar by userId',
    tags: ['user'],
    parameters: { userId: Path(Str) },
    responses: {
      '200': {
        description: 'Avatar retrieved successfully',
        schema: new Str(),
      },
      '400': {
        description: 'Bad Request',
        schema: {
          error: new Str({ example: 'userId is required' }),
        },
      },
      '404': {
        description: 'Avatar not found',
        schema: {
          error: new Str({ example: 'Avatar not found' }),
        },
      },
      '500': {
        description: 'Server Error',
        schema: {
          error: new Str({ example: 'Failed to retrieve avatar' }),
        },
      },
    },
  }

  async handle(
    _request: Request,
    env: Env,
    _ctx: any,
    data: { params: { userId: string } },
  ): Promise<Response> {
    let { userId } = data.params

    try {
      // Fetch user details
      const user = await getUserById(env.DB, userId)

      if (!user || !user.avatarUrl) {
        return errorResponse('Avatar not found', 404)
      }

      // Fetch avatar from KV storage
      const avatarId = user.avatarUrl.split('/').pop()

      if (!avatarId) {
        return errorResponse('Avatar not found', 404)
      }
      const fileResponse = await env.FILES_KV.getWithMetadata<{
        fileName: string
        type: string
      }>(avatarId, 'arrayBuffer')

      if (!fileResponse) {
        return errorResponse('Avatar not found', 404)
      }

      // If the file is found, return the file content and relevant headers
      return new Response(fileResponse.value, {
        headers: {
          'Content-Type': fileResponse.metadata!.type,
          Etag: avatarId,
        },
      })
    } catch (error) {
      console.error('Error retrieving avatar:', error)
      return errorResponse('Failed to retrieve avatar', 500)
    }
  }
}
