import { ChatList } from '~/types/ChatList'
import { Env } from '~/types/Env'
import { WebSocketGod } from './WebSocketService'
import { OfflineEvent, OnlineEvent } from '~/types/ws/server-events'
import { chatStorage, userStorage } from './utils/mdo'
export type OnlineStatus = { lastSeen: number; status: 'online' | 'offline' }
export class OnlineStatusService {
  constructor(
    private state: DurableObjectState,
    private env: Env,
    private ws: WebSocketGod,
  ) {
    state.blockConcurrencyWhile(async () => this.initialize())
  }


  async initialize() {
    this.#lastSeen = (await this.state.storage.get<number>('lastSeen')) || 0
  }

  isOnline() {
    return this.#isOnline
  }

  status(): OnlineStatus {
    return {
      status: this.#isOnline ? 'online' : 'offline',
      lastSeen: this.#isOnline ? this.timestamp() : this.#lastSeen,
    }
  }

  async blink(): Promise<void> {
    this.#isOnline = true
    const chatList = await this.state.storage.get<ChatList>('chatList')!
    const timestamp = this.timestamp()
    const promises: Promise<never>[] = []
    if (!chatList) {
      return
    }

    for (const chat of chatList.filter(
      c =>
        c.type === 'dialog' &&
        c.id !== this.userId &&
        !c.isMine &&
        c.lastMessageStatus === 'undelivered',
    )) {
      const storage = chatStorage(this.env, chat.id, this.userId)
      chat.lastMessageStatus = 'unread'
      promises.push(storage.dlvrd(this.userId, { chatId: chat.id }, timestamp))
    }
    await this.state.storage.put('chatList', chatList)
    this.state.waitUntil(Promise.all(promises))
  }
  async online(): Promise<ChatList> {
    this.#isOnline = true
    const chatList = await this.state.storage.get<ChatList>('chatList')!
    const timestamp = this.timestamp()
    const promises: Promise<never>[] = []
    if (!chatList) {
      return []
    }

    for (const chat of chatList) {
      if (chat.id === this.userId) {
        continue
      }
      if (chat.type === 'dialog') {
        const receiverDO = userStorage(this.env, chat.id)

        const chatStatus: OnlineStatus = await (
          await receiverDO.fetch(
            new Request(`${this.env.ORIGIN}/${chat.id}/messaging/event/online`, {
              method: 'POST',
              body: JSON.stringify({ userId: this.userId }),
            }),
          )
        ).json<OnlineStatus>()

        const event: OnlineEvent = { lastSeen: chatStatus.lastSeen, userId: chat.id }
        if (chatStatus.status === 'online') {
          this.ws.toBuffer('online', event)
        }
      }

    }
		await this.blink()

    return chatList
  }

  async offline() {
    this.#isOnline = false
    this.#lastSeen = Date.now()
    await this.state.storage.put('lastSeen', Date.now())
    const chatList = (await this.state.storage.get<ChatList>('chatList')) || []
    for (const chat of chatList!) {
      if (chat.type !== 'dialog' || chat.id === this.userId) {
        continue
      }
      const receiverDO = userStorage(this.env, chat.id)
      const event: OfflineEvent = { userId: this.userId, lastSeen: this.#lastSeen }
      await receiverDO.fetch(
        new Request(`${this.env.ORIGIN}/${chat.id}/messaging/event/offline`, {
          method: 'POST',
          body: JSON.stringify(event),
        }),
      )
    }
  }

  setUserId(id: string) {
    this.userId = id
  }

  private timestamp() {
    const current = performance.now()
    return (this.#timestamp = current > this.#timestamp ? current : ++this.#timestamp)
  }
  userId = ''
  #isOnline = false
  #lastSeen: number = 0
  #timestamp = Date.now()
}
