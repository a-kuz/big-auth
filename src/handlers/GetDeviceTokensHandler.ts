import { Arr, OpenAPIRoute, OpenAPIRouteSchema, Path, Str } from '@cloudflare/itty-router-openapi'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { fingerprintDO } from '~/durable-objects/messaging/utils/get-durable-object'
import { writeErrorLog } from '~/utils/serialize-error'

export async function GetDeviceTokensHandler(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  data: { params: { userId: string } },
): Promise<Response> {
  const p = new URLPattern('/deviceTokens/:fingerprint', env.ORIGIN)
  const exec = p.exec(request.url)
  const fingerprint = exec?.pathname.groups.fingerprint

  if (!fingerprint) {
    return errorResponse('fingerprint is required', 400)
  }

  try {
    const storage = fingerprintDO(env, fingerprint)
    const tokens = {
      'ios-notification': await storage.getToken('ios-notification'),
      'ios-voip': await storage.getToken('ios-voip'),
    }

    if (Object.values(tokens).filter(token => !!token).length === 0) {
      return errorResponse('User not found or no device tokens available', 404)
    }

    return jsonResp(tokens)
  } catch (error) {
    console.error('Failed to retrieve device tokens:')
    await writeErrorLog(error)
    return errorResponse('Internal Server Error', 500)
  }
}
