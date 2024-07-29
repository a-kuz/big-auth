import { WorkerEntrypoint } from 'cloudflare:workers'
import { userStorageById } from './durable-objects/messaging/utils/get-durable-object'
import { Env } from './types/Env'

export class DeliveringEnterypoint extends WorkerEntrypoint {
  constructor(
    readonly ctx: ExecutionContext,
    readonly env: Env,
  ) {
    super(ctx, env)
  }
  async dlvrd(userId: string, chatId: string, messageId: number): Promise<void> {
    const userMessagingDO = userStorageById(this.env, userId)
    this.ctx.waitUntil(userMessagingDO.dlvrdRequest({ chatId, messageId }, Date.now()))
  }
}
