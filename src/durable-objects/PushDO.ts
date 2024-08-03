import { Env } from '~/types/Env'
import { DebugableDurableObject } from './DebugableDurableObject'
export type TokenType = 'ios-notification' | 'ios-voip'
export class PushDO extends DebugableDurableObject {
  constructor(
    readonly ctx: DurableObjectState,
    readonly env: Env,
  ) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(()=>this.initialize())
  }

  
  #tokens: {[K in TokenType]?: string } = {}
  #userId?: string

  async initialize() {
    const all = await this.ctx.storage.list<string>();
    this.#userId = all.get("userId")
    this.#tokens['ios-notification'] = all.get("token-ios-notification")
    this.#tokens['ios-voip'] = all.get("token-ios-voip")
  }

  async setTokenAndGetUserId(tokenType: TokenType, deviceToken: string) {
    if (this.#tokens[tokenType] !== deviceToken) {
      this.#tokens[tokenType] = deviceToken
      await this.ctx.storage.put(`token-${tokenType}`, deviceToken)
    }
    return this.#userId
  }

  async setUserIdAndGetTokens(userId: string) {
    if (this.#userId !== userId) {
      await this.ctx.storage.put('userId', userId);
    }    
    return this.#tokens
  }

}
