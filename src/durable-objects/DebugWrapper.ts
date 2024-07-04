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

  async listKeys(opts: DurableObjectListOptions = {}, partNumber = 0) {
    if (this.env.ENV === 'production') return
    const keys = await this.state.storage.list(opts)
    const result = {}
    for (const key of keys.keys()) {
      const value = keys.get(key)
      //@ts-ignore
      result[key] = value
    }

    return this.returnBigResult(result, partNumber)
  }
  async getPrivate(field: string, partNumber: number = 1) {
    if (this.env.ENV === 'production') return
    //@ts-ignore
    const value: number | string | Map | any[] = this[field] || this['#' + field]
		return this.returnBigResult(value, partNumber)
  }

  returnBigResult(value: number | string | Map<any, any> | any[] | Object, partNumber: number) {
    const serealizeReadyValue = value instanceof Map ? Object.fromEntries(value) : value
		const result = JSON.stringify(serealizeReadyValue)
    const partSize = 1000000
    const parts = Math.ceil(result.length / partSize)
    const start = partNumber * partSize
    const end = start + partSize
    const part = result.slice(start, end)
    return `{ "parts": ${parts}, "part": "${part}"  }`
  }

  async run(code: string) {
    if (this.env.ENV === 'production') return
    //@ts-ignore
    return this.debugInfo()
  }
}
