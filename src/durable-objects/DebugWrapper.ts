import { DurableObject } from 'cloudflare:workers'
import { i } from 'vitest/dist/reporters-yx5ZTtEV'
import { Env } from '~/types/Env'

export class DebugWrapper extends DurableObject {
  constructor(
    readonly state: DurableObjectState,
    readonly env: Env,
  ) {
    super(state, env)
  }

  async listKeys(opts: DurableObjectListOptions = {}) {
    if (this.env.ENV === 'production') return
    const keys = await this.state.storage.list(opts)
    const result = {}
    for (const key of keys.keys()) {
      const value = keys.get(key)
      //@ts-ignore
      result[key] = value
    }

    return JSON.stringify(result)
  }
  async getPrivate(field) {
    if (this.env.ENV === 'production') return
    //@ts-ignore
    return this[field] || this['#' + field].filter(e=>!!e)
  }

  async run(code: string) {
   if (this.env.ENV === 'production') return
		return this.debugInfo()
    //@ts-ignore
  }
}
