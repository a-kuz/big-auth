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

  async setToken(fingerprint: string, deviceToken: string) {
    await this.ctx.storage.put('fingerprint', fingerprint)
    await this.ctx.storage.put('token', deviceToken)
  }

  async getToken() {
    return this.ctx.storage.get<string>(`token`)
  }
}
