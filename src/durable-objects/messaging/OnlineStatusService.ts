import { ChatList } from '~/types/ChatList'
import { Env } from '~/types/Env'
import { WebSocketGod } from './WebSocketService'
import { OnlineEvent } from '~/types/ws/server-events'
import { userStorage } from './utils/mdo'

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
    this.#isOnline = true
    const chatList = await this.state.storage.get<ChatList>('chatList')

    if (!chatList) {
      return
    }

    for (const chat of chatList) {
      if (chat.type !== 'dialog' || chat.id === this.userId || chat.id.length < 20) {
        continue
      }

      const receiverDO = userStorage(this.env, chat.id)

      const chatStatus = await (
        await receiverDO.fetch(
          new Request(`${this.env.ORIGIN}/${chat.id}/messaging/event/online`, {
            method: 'POST',
            body: JSON.stringify({ userId: this.userId }),
          }),
        )
      ).text()

      if (chatStatus === 'online') {
        const event: OnlineEvent = { userId: chat.id }
        this.ws.sendEvent('online', event)
      }
    }
  }

  async offline() {
    this.#isOnline = false
    const chatList = (await this.state.storage.get<ChatList>('chatList')) || []
    for (const chat of chatList!) {
      if (chat.type !== 'dialog' || chat.id === this.userId) {
        continue
      }
      const receiverDO = userStorage(this.env, chat.id)

      await receiverDO.fetch(
        new Request(`${this.env.ORIGIN}/${chat.id}/messaging/event/offline`, {
          method: 'POST',
          body: JSON.stringify({ type: 'offline', userId: this.userId }),
        }),
      )
    }
  }

  setUserId(id: string) {
    this.userId = id
  }
  userId = ''
  #isOnline = false
}
