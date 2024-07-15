import { DurableObject } from 'cloudflare:workers'
import { Env } from '~/types/Env'
import { DebugWrapper } from './DebugWrapper'

export class VoipTokenDO extends DebugWrapper {
  constructor(
    readonly state: DurableObjectState,
    readonly env: Env,
  ) {
    super(state, env)
  }

  async setToken(deviceToken: string) {
    await this.state.storage.put('token', deviceToken)
  }
  async setFingerPrint(fingerPrint: string) {
    await this.state.storage.put('fingerPrint', fingerPrint)
  }
  async getToken() {
    return this.state.storage.get<string>(`token`)
  }
}
