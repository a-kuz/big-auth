import { DurableObject } from 'cloudflare:workers'
import { i } from 'vitest/dist/reporters-yx5ZTtEV'
import { Env } from '~/types/Env'
import { TaskManager } from './outboxing/TaskManager'

export class DebugableDurableObject extends TaskManager {
  constructor(
    readonly ctx: DurableObjectState,
    readonly env: Env,
  ) {
    
    super(ctx, env)
  }
  async fetch(request: Request){return new Response}

  async listKeys(opts: DurableObjectListOptions = {}, partNumber = 0) {
    if (this.env.ENV === 'production') return
    const keys = await this.ctx.storage.list(opts)
    const result: Record<string, any> = {}
    for (const key of keys.keys()) {
      const value = keys.get(key)
      result[key] = value
    }

    return DebugableDurableObject.returnBigResult(result, partNumber)
  }
  async deleteAll() {
    await this.ctx.storage.deleteAll()
  }
  async getPrivate(field: string, partNumber: number = 1) {
    if (this.env.ENV === 'production') return
    //@ts-ignore
    const value: number | string | Map | any[] = this[field] || this['#' + field]
    return DebugableDurableObject.returnBigResult(value, partNumber)
  }

  static returnBigResult(
    value: number | string | Map<any, any> | any[] | Object,
    partNumber: number,
  ) {
    const serealizeReadyValue = value instanceof Map ? Object.fromEntries(value) : value
    const result = JSON.stringify(serealizeReadyValue)
    const partSize = 1000000
    const parts = Math.ceil(result.length / partSize)
    if (parts === 1) return result
    const start = partNumber * partSize
    const end = start + partSize
    const part = result.slice(start, end)
    return `{ "parts": ${parts}, "part": "${part}"  }`
  }

  async run(code: string) {
    if (this.env.ENV === 'production') return

    return this.debugInfo()
  }

  async debugInfo(): Promise<string> {
    return ''
  }
}
