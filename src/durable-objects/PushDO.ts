import { DurableObject } from 'cloudflare:workers'
import { Env } from '~/types/Env'
import { UserId } from '~/types/ws/internal'
import { userStorage } from './messaging/utils/mdo'

export class PushDO extends DurableObject {
  constructor(
    readonly state: DurableObjectState,
    readonly env: Env,
  ) {
    super(state, env)
  }

  async setToken(userId: UserId, fingerprint: string, deviceToken: string) {
    const receiverDO = userStorage(this.env, userId)

    const resp = await receiverDO.fetch(
      new Request(`${this.env.ORIGIN}/${userId}/client/request/setDeviceToken`, {
        method: 'POST',
        body: JSON.stringify({ fingerprint, deviceToken }),
      }),
    )
    await this.ctx.storage.deleteAll()
    await this.ctx.storage.put(`${userId}:${fingerprint}`, deviceToken)
  }

  async getToken(userId: UserId, fingerprint: string) {
    return this.ctx.storage.get<string>(`${userId}:${fingerprint}`)
  }

  async getTokens() {
    const list = await this.ctx.storage.list<string>()
    const tokens: { fingerprint: string; deviceToken: string }[] = []
    for (const [key, value] of list) {
      tokens.push({ fingerprint: key.split(':')[1], deviceToken: value })
    }
    return tokens
  }
}
