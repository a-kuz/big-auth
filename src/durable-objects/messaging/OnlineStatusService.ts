import { ChatList } from '~/types/ChatList'
import { Env } from '~/types/Env'
import { WebSocketGod } from './WebSocketService'
import { OfflineEvent, OnlineEvent } from '~/types/ws/server-events'
import { chatStorage, userStorage } from './utils/mdo'
import { url } from 'inspector'
import { wrap } from 'module'
import { writeErrorLog } from '~/utils/serialize-error'
import { ChatListService } from './ChatListService'
export type OnlineStatus = { lastSeen: number; status: 'online' | 'offline' }
export class OnlineStatusService {
  constructor(
    private state: DurableObjectState,
    private env: Env,
    private ws: WebSocketGod,
    private chatListService: ChatListService,
  ) {
    state.blockConcurrencyWhile(async () => this.initialize())
  }

  async alarm(): Promise<void> {
    await this.processOutgoingStatusQueue()
    await this.processOutgoingDlvrdQueue()
  }

  #outgoingStatusQueue: { userId: string }[] = []
  #outgoingDlvrdQueue: { chatId: string }[] = []

  async initialize() {
    this.#lastSeen = (await this.state.storage.get<number>('lastSeen')) || 0
    this.#outgoingStatusQueue =
      (await this.state.storage.get<{ userId: string }[]>('outgoingStatusQueue')) || []
    this.#outgoingDlvrdQueue =
      (await this.state.storage.get<{ chatId: string }[]>('outgoingDlvrdQueue')) || []
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
      this.#outgoingDlvrdQueue.push({ chatId: chat.id })
      const storage = chatStorage(this.env, chat.id, this.userId)
      chat.lastMessageStatus = 'unread'
      //promises.push(storage.dlvrd(this.userId, { chatId: chat.id }, timestamp))
    }
    await this.state.storage.put('outgoingDlvrdQueue', this.#outgoingDlvrdQueue)
    await this.state.storage.put('chatList', chatList)
    //this.state.waitUntil(Promise.all(promises))
  }

  async processOutgoingStatusQueue(): Promise<void> {
    const { status } = this.status()
    const reqBody = JSON.stringify({ userId: this.userId, lastSeen: this.#lastSeen })
    let eventsPerProcessing = 3
    // const chatList
    while (this.#outgoingStatusQueue.length && eventsPerProcessing) {
      eventsPerProcessing--
      const event = this.#outgoingStatusQueue.shift()
      if (event) {
        let resp: Response, friendStatus: OnlineStatus
        try {
          const receiverDO = userStorage(this.env, event.userId)

          const url = `${this.env.ORIGIN}/${event.userId}/messaging/event/${status}`
          try {
            resp = await receiverDO.fetch(url, { body: reqBody, method: 'POST' })
            friendStatus = await resp.json<OnlineStatus>()
          } catch (error) {
            writeErrorLog(error)
            if (resp!) console.log('!!!!! FRIEND', await resp.clone().text())

            friendStatus = { status: 'offline', lastSeen: 1 }
          }
          if (friendStatus.status === 'online') {
            const wsEvent: OnlineEvent = { lastSeen: friendStatus.lastSeen, userId: event.userId }
            if (friendStatus.status === 'online') {
              this.ws.toBuffer('online', wsEvent)
            }
          } else {
          }
          const chatIndex = this.chatListService.chatList.findIndex(c => c.id === event.userId)
          if (chatIndex !== -1) {
            const lastSeen = friendStatus.status === 'online' ? 0 : friendStatus.lastSeen
            await this.chatListService.save()
            if (this.chatListService.chatList[chatIndex].lastSeen !== lastSeen) {
              this.chatListService.chatList[chatIndex].lastSeen = lastSeen
              this.chatListService.save()
            }
          }
          await this.state.storage.put('outgoingStatusQueue', this.#outgoingStatusQueue)
        } catch (e) {
          // this.#outgoingStatusQueue.push(event)
          console.error('Failed to process outgoing event:', e)
          await writeErrorLog(e)
        }
      }
    }
    if (this.#outgoingStatusQueue.length) {
      this.state.storage.setAlarm(new Date(Date.now() + 1000))
    }
  }
  async processOutgoingDlvrdQueue(): Promise<void> {
    console.log('outgoing dlvrd queue processing')
    const timestamp = this.timestamp()
    let eventsPerProcessing = 3
    let hasErrored = false
    while (this.#outgoingDlvrdQueue.length && eventsPerProcessing) {
      eventsPerProcessing--
      const event = this.#outgoingDlvrdQueue.shift()
      if (event) {
        try {
          const receiverDO = chatStorage(this.env, event.chatId, this.userId)
          await receiverDO.dlvrd(this.userId, { chatId: event.chatId }, timestamp)
          await this.state.storage.put('outgoingDlvrdQueue', this.#outgoingDlvrdQueue)
        } catch (e) {
          //this.#outgoingDlvrdQueue.push(event)
          console.error('Failed to process outgoing event:', e)
          await writeErrorLog(e)
          hasErrored = true
        }
      } else {
        await this.state.storage.put('outgoingDlvrdQueue', this.#outgoingDlvrdQueue)
      }
    }
    if (this.#outgoingDlvrdQueue.length) {
      this.state.storage.setAlarm(new Date(Date.now() + (hasErrored ? 3000 : 100)))
    }
  }
  async online(): Promise<ChatList> {
    // use tasks too
    this.#isOnline = true
    this.#lastSeen = Date.now()
    await this.state.storage.put('lastSeen', Date.now())
    const chatList = await this.state.storage.get<ChatList>('chatList')!
    const timestamp = this.timestamp()
    const promises: Promise<never>[] = []
    if (!chatList) {
      return []
    }
    this.#outgoingStatusQueue = chatList
      .filter(c => c.type === 'dialog' && c.id !== this.userId)
      .map(c => ({ userId: c.id }))
    await this.state.storage.put('outgoingStatusQueue', this.#outgoingStatusQueue)

    await this.blink()
    await this.state.storage.setAlarm(Date.now() + 100)
    return chatList
  }

  async offline() {
    this.#isOnline = false
    this.#lastSeen = Date.now()
    await this.state.storage.put('lastSeen', Date.now())
    const chatList = (await this.state.storage.get<ChatList>('chatList')) || []
    this.#outgoingStatusQueue = chatList
      .filter(c => c.type === 'dialog' && c.id !== this.userId)
      .map(c => ({ userId: c.id }))
    await this.state.storage.put('outgoingStatusQueue', this.#outgoingStatusQueue)
    await this.state.storage.setAlarm(Date.now() + 100)
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
