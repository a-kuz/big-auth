import { pushStorage, userStorage } from '~/durable-objects/messaging/utils/mdo'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'

export const WebsocketHandler = async (request: Request, env: Env, ..._args: any[]) => {
  try {
    const user = env.user

    const mDO = userStorage(env, user.id)

    const fingerprint = request.headers.get('fingerprint')

    if (fingerprint) {
      const deviceToken = await pushStorage(env, user.id).getToken(fingerprint, fingerprint)
      const resp = await mDO.fetch(
        new Request(`${env.ORIGIN}/${user.id}/client/request/setDeviceToken`, {
          method: 'POST',
          body: JSON.stringify({ fingerprint, deviceToken }),
        }),
      )
    }
    return mDO.fetch(new Request(`${env.ORIGIN}/${user.id}/client/connect/websocket`, request))
  } catch (error) {
    console.error(error)
    return errorResponse('Something went wrong')
  }
}
