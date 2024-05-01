import { ChatList } from '~/types/ChatList'
import { Env } from '~/types/Env'
import { WebSocketGod } from './WebSocketService'
import { OnlineEvent } from '~/types/ws/server-events'

export class OnlineStatusService {
  constructor(
    private state: DurableObjectState,
    private env: Env,
    private ws: WebSocketGod,
  ) {}

  isOnline() {
    return this.#isOnline
  }

  async online() {
    const chatList = await this.state.storage.get<ChatList>('chatList')

    if (!chatList) {
      return
    }

    for (const chat of chatList) {
      if (chat.type !== 'dialog' || chat.id === this.#userId) {
        continue
      }

    }
    this.#isOnline = true
  }

  async offline() {
    this.#isOnline = false
    const chatList = await this.state.storage.get<ChatList>('chatList')
    for (const chat of chatList!) {
      if (chat.type !== 'dialog' || chat.id === this.#userId) {
        continue
      }
      const receiverDOId = this.env.USER_MESSAGING_DO.idFromName(chat.id)
      const receiverDO = this.env.USER_MESSAGING_DO.get(receiverDOId)

      await receiverDO.fetch(
        new Request(`${this.env.ORIGIN}/${chat.id}/i-am-offline`, {
          method: 'POST',
          body: JSON.stringify({ type: 'offline', userId: this.#userId }),
        }),
      )
    }
  }

  setUserId(id: string) {
    this.#userId = id
  }
  #userId = ''
  #isOnline = false
}
