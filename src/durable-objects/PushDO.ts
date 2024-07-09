import { Env } from '~/types/Env'
import { DebugWrapper } from './DebugWrapper'
export type TokenType = 'ios-notification' | 'ios-voip'
export class PushDO extends DebugWrapper {
  constructor(
    readonly state: DurableObjectState,
    readonly env: Env,
  ) {
    super(state, env)
  }

  async setToken(fingerprint: string, tokenType: TokenType, deviceToken: string) {
    await this.ctx.storage.put(`token-${tokenType}`, deviceToken)
  }

  async getToken(tokenType: TokenType = 'ios-notification') {
    return this.ctx.storage.get<string>(`token-${tokenType}`)
  }
}
