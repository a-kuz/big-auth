import { WorkerEntrypoint } from 'cloudflare:workers'
import {
  userStorage
} from './durable-objects/messaging/utils/mdo'
import { Env } from './types/Env'

export class DeliveringEnterypoint extends WorkerEntrypoint {
  constructor(
    readonly ctx: ExecutionContext,
    readonly env: Env,
  ) {
    super(ctx, env)
  }
  async dlvrd(userId: string, chatId: string, messageId: string): Promise<void> {
    const userMessagingDO = userStorage(this.env, userId)
    this.ctx.waitUntil(
      
      userMessagingDO
        .fetch(
          new Request(`${this.env.ORIGIN}/${userId}/client/request/dlvrd`, {
            method: 'POST',
            body: JSON.stringify({chatId, userId, messageId}),
          }),
        )
        .then(response => {
          return response
        }),
    )
  }
}
