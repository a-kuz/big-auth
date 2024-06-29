import { Arr, OpenAPIRoute, OpenAPIRouteSchema, Path, Str } from '@cloudflare/itty-router-openapi'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { pushStorage } from '~/durable-objects/messaging/utils/mdo'
import { writeErrorLog } from '~/utils/serialize-error'

export async function GetDeviceTokensHandler(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  data: { params: { userId: string } },
): Promise<Response> {
  const p = new URLPattern('/deviceTokens/:userId', env.ORIGIN)
  const exec = p.exec(request.url)
  const userId = exec?.pathname.groups.id
  console.log('id', userId)
  if (!userId) {
    return errorResponse('User ID is required', 400)
  }

  try {
    const storage = pushStorage(env, userId)
    const tokens = await storage.getTokens()

    if (!tokens || tokens.length === 0) {
      return errorResponse('User not found or no device tokens available', 404)
    }

    return new Response(JSON.stringify(tokens), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Failed to retrieve device tokens:')
		await writeErrorLog(error)
    return errorResponse('Internal Server Error', 500)
  }
}
