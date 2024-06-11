import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
  RouteValidated,
  Str,
} from '@cloudflare/itty-router-openapi'
import { getUserByToken } from '../services/get-user-by-token'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { pushStorage, userStorage } from '~/durable-objects/messaging/utils/mdo'

export class WebsocketHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    security: [{ BearerAuth: [] }],
  }
  validateRequest(request: Request<unknown, CfProperties<unknown>>): Promise<RouteValidated> {
    // @ts-ignore
    return { data: {} }
  }

  async execute(request: Request, env: Env, _context: any, data: Record<string, any>) {
    try {
      let token = ''
      const authorization = request.headers.get('Authorization')
      token = authorization?.split(' ')[1] || ''
      if (!token) {
        try {
          const protocol = request.headers.get('Sec-WebSocket-Protocol')
          if (protocol) {
            if (protocol.startsWith('protocol, e')) {
              token = protocol.slice(10)
              console.log(token)
            }
          }
        } catch (e) {}
      }

      if (!token) {
        return errorResponse('Unauthorized', 401)
      }

      let user
      try {
        try {
          user = await getUserByToken(env.DB, token, env.JWT_SECRET)
        } catch (e) {
          return errorResponse('invalid token', 401)
        }
        if (!user) {
          return errorResponse('user not exist', 401)
        }

        const mDO = userStorage(env, user.id)

        const fingerprint = request.headers.get('fingerprint')
        const url = new URL(request.url)
        if (!fingerprint) {
          console.error('No fp')
          return errorResponse('need fingerprint', 400)
        }
        const deviceToken = await pushStorage(env, user.id).getToken(fingerprint, fingerprint)
        const resp = await mDO.fetch(
          new Request(`${env.ORIGIN}/${user.id}/client/request/setDeviceToken`, {
            method: 'POST',
            body: JSON.stringify({ fingerprint, deviceToken }),
          }),
        )
        return mDO.fetch(new Request(`${env.ORIGIN}/${user.id}/client/connect/websocket`, request))
      } catch (error) {
        console.error(error)
        return errorResponse('Something went wrong')
      }
    } catch (error) {
      console.error('!!!!')
      console.error({ error })
      return errorResponse('Something went worng')
    }
  }
}
