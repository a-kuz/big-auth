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
		this.#isOnline = true
    const chatList = await this.state.storage.get<ChatList>('chatList')
    console.log({ chatList })
    if (!chatList) {
      return
    }

    for (const chat of chatList) {
      if (chat.type !== 'dialog' || chat.id === this.#userId) {
        continue
      }
      const userId = chat.id

      const receiverDOId = this.env.USER_MESSAGING_DO.idFromName(userId)
      const receiverDO = this.env.USER_MESSAGING_DO.get(receiverDOId)

      const chatStatus = await (
        await receiverDO.fetch(
          new Request(`${this.env.ORIGIN}/${chat.id}/internal/event/online`, {
            method: 'POST',
            body: JSON.stringify({ userId: this.#userId }),
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
    const chatList = await this.state.storage.get<ChatList>('chatList') || [		]
    for (const chat of chatList!) {
      if (chat.type !== 'dialog' || chat.id === this.#userId) {
        continue
      }
      const receiverDOId = this.env.USER_MESSAGING_DO.idFromName(chat.id)
      const receiverDO = this.env.USER_MESSAGING_DO.get(receiverDOId)

      await receiverDO.fetch(
        new Request(`${this.env.ORIGIN}/${chat.id}/internal/event/offline`, {
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
