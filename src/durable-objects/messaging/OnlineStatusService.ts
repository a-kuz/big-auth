import { ChatList } from '~/types/ChatList'
import { Env } from '~/types/Env'
import { WebSocketGod } from './WebSocketService'
import { OnlineEvent } from '~/types/ws/server-events'
import { chatStorage, userStorage } from './utils/mdo'

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
    const timestamp = Date.now()
    const promises: Promise<never>[] = []
    if (!chatList) {
      return
    }

    for (const chat of chatList) {
      if (chat.id === this.userId) {
        continue
      }
      if (chat.type === 'dialog') {
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
          this.ws.toBuffer('online', event)
        }
      }
      if (chat.type !== 'ai') {
        if (chat.lastMessageStatus === 'undelivered' && !chat.isMine) {
          const storage = chatStorage(this.env, chat.id, this.userId)
          promises.push(storage.dlvrd(this.userId, { chatId: chat.id }, timestamp))
        }
      }
    }
    this.state.waitUntil(Promise.all(promises))
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
