import {
  fingerprintDO,
  userStorageById,
} from '~/durable-objects/messaging/utils/get-durable-object'
import { Env } from '../types/Env'
import { errorResponse, unauthorized } from '../utils/error-response'

export const WebsocketHandler = async (request: Request, env: Env, ctx: ExecutionContext, ..._args: any[]) => {
  try {
    const user = env.user
    if (!env.user) {
      return unauthorized()
    }
    const userStorage = userStorageById(env, user.id)
    
    const fingerprint = request.headers.get('fingerprint')
    ctx.waitUntil((async () => {
      await userStorage.setUserId(user.id) // stupid line
      if (fingerprint) {
        const VOIP_TOKEN_DO = env.VOIP_TOKEN_DO
        const id = VOIP_TOKEN_DO.idFromName(user.id)
        const voipTokenDO = await VOIP_TOKEN_DO.get(id,)
        
        const tokenStorage = fingerprintDO(env, fingerprint)
        const deviceTokens = await tokenStorage.setUserIdAndGetTokens(user.id)    
        const deviceToken = deviceTokens['ios-notification']
        const deviceTokenVoip = deviceTokens['ios-voip']
        if (deviceToken) {
          await userStorage.setDeviceTokenRequest({ fingerprint, deviceToken, type: 'ios-notification' })
        }        
        if (deviceTokenVoip) {
          await voipTokenDO.setToken(deviceTokenVoip)
        }
      }
    })())
    return userStorage.fetch(
      new Request(`${env.ORIGIN}/${user.id}/client/connect/websocket`, request),
    )
  } catch (error) {
    console.error(error)
    return errorResponse('Something went wrong')
  }
}
