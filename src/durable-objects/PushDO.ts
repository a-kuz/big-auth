import { Env } from '~/types/Env'
import { DebugWrapper } from './DebugWrapper'
export type TokenType = 'ios-notification' | 'ios-voip'
export class PushDO extends DebugWrapper {
  constructor(
    readonly ctx: DurableObjectState,
    readonly env: Env,
  ) {
    super(ctx, env)
  }

  async setToken(fingerprint: string, tokenType: TokenType, deviceToken: string) {
    await this.ctx.storage.put(`token-${tokenType}`, deviceToken)
  }
  async setUserId(userId: string) {
    await this.ctx.storage.put('userId', userId);
  }
  async getUserId() {
    await this.ctx.storage.get<string>('userId');
  }
  async getToken(tokenType: TokenType = 'ios-notification') {
    return this.ctx.storage.get<string>(`token-${tokenType}`)
  }
}
