import { fingerprintDO, userStorage } from '~/durable-objects/messaging/utils/mdo'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'

export const WebsocketHandler = async (request: Request, env: Env, ..._args: any[]) => {
  try {
    const user = env.user
    if (!env.user) {return new Response()}
    const mDO = userStorage(env, user.id)

    const fingerprint = request.headers.get('fingerprint')

    if (fingerprint) {
      const tokenStorage = fingerprintDO(env, fingerprint)
      const deviceToken = await tokenStorage.getToken()
      await mDO.fetch(
        new Request(`${env.ORIGIN}/${user.id}/client/request/setDeviceToken`, {
          method: 'POST',
          body: JSON.stringify({ fingerprint, deviceToken }),
        }),
      )
      const deviceTokenVoip = await tokenStorage.getToken('ios-voip');
      if (deviceTokenVoip) {
        const VOIP_TOKEN_DO = env.VOIP_TOKEN_DO;
        const id = VOIP_TOKEN_DO.idFromName(user.id);
        const voipTokenDO = await VOIP_TOKEN_DO.get(id, { locationHint: 'weur' })
        voipTokenDO.setToken(deviceTokenVoip);
      }
    }
    return mDO.fetch(new Request(`${env.ORIGIN}/${user.id}/client/connect/websocket`, request))
  } catch (error) {
    console.error(error)
    return errorResponse('Something went wrong')
  }
}
