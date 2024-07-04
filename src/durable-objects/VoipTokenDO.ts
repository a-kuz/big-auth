import { DurableObject } from 'cloudflare:workers'
import { Env } from '~/types/Env'

export class VoipTokenDO extends DurableObject {
  constructor(
    readonly state: DurableObjectState,
    readonly env: Env,
  ) {
    super(state, env)
  }

  async setToken(deviceToken: string) {
    await this.ctx.storage.put('token', deviceToken)
  }

  async getToken() {
    return this.ctx.storage.get<string>(`token`)
  }
}
