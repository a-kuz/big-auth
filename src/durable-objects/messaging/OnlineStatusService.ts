import { ChatList } from '~/types/ChatList'
import { Env } from '~/types/Env'
import { OfflineEvent, OnlineEvent } from '~/types/ws/server-events'
import { writeErrorLog } from '~/utils/serialize-error'
import { ChatListService } from './ChatListService'
import { chatStorage, userStorageById } from './utils/get-durable-object'
import { WebSocketGod } from './WebSocketService'
export type OnlineStatus = { lastSeen?: number; status: 'online' | 'offline' }
export const UNKNOWN_LAST_SEEN = 1719781200000 // 2024-07-01
const LASTSEEN_TTL = 1000 * 5
export class OnlineStatusService {
  #lastSeenCache = new Map<string, { lastSeen?: number; timestamp: number }>()
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
    this.#lastSeen = (await this.state.storage.get<number>('lastSeen')) || UNKNOWN_LAST_SEEN
    this.#outgoingStatusQueue =
      (await this.state.storage.get<{ userId: string }[]>('outgoingStatusQueue')) || []
    this.#outgoingDlvrdQueue =
      (await this.state.storage.get<{ chatId: string }[]>('outgoingDlvrdQueue')) || []
    this.userId = (await this.state.storage.get<string>('userId')) || this.env.user?.id
  }

  isOnline() {
    return this.#isOnline
  }

  async lastSeenOf(userId: string): Promise<number | undefined> {
    const cached = this.#lastSeenCache.get(userId)
    if (cached) {
      if (cached.timestamp > Date.now() - LASTSEEN_TTL) {
        this.#lastSeenCache.delete(userId)
      } else {
        return cached.lastSeen
      }
    }
    const mdo = await userStorageById(this.env, userId)
    const onlineStatus = await mdo.onlineStatusRequest()

    if (onlineStatus.status === 'online') {
      this.#lastSeenCache.set(userId, { lastSeen: undefined, timestamp: Date.now() })
      return undefined
    } else {
      this.#lastSeenCache.set(userId, { lastSeen: onlineStatus.lastSeen, timestamp: Date.now() })
      return onlineStatus.lastSeen
    }
  }
  status(): OnlineStatus {
    return {
      status: this.#isOnline ? 'online' : 'offline',
      lastSeen: this.#isOnline ? undefined : this.#lastSeen ? this.#lastSeen : UNKNOWN_LAST_SEEN,
    }
  }

  async blink(): Promise<void> {
    if (!this.chatListService.chatList) {
      return
    }
    const timestamp = this.timestamp()
    for (const chat of this.chatListService.chatList.filter(
      chat =>
        (chat.type === 'dialog' || chat.type === 'group') &&
        chat.id !== this.userId &&
        !chat.isMine &&
        chat.lastMessageStatus === 'undelivered',
    )) {
      //this.#outgoingDlvrdQueue.push({ chatId: chat.id })
      const receiverDO = chatStorage(this.env, chat.id, this.userId)
      await receiverDO.dlvrd(this.userId, { chatId: chat.id }, timestamp)
      chat.lastMessageStatus = 'unread'
      this.chatListService.save()
    }
    // await this.state.storage.put('outgoingDlvrdQueue', this.#outgoingDlvrdQueue)
    // await this.state.storage.setAlarm(Date.now() + 100)
  }

  async processOutgoingStatusQueue(eventsPerProcessing = 6): Promise<void> {
    while (this.#outgoingStatusQueue.length && eventsPerProcessing) {
      eventsPerProcessing--
      const event = this.#outgoingStatusQueue.shift()
      if (event) {
        const { status } = this.status()
        const req = {
          userId: this.userId,
          ...(status === 'online' ? {} : { lastSeen: this.#lastSeen || Date.now() }),
        }

        let friendStatus: OnlineStatus
        try {
          const receiverDO = userStorageById(this.env, event.userId)

          try {
            friendStatus =
              status === 'online'
                ? await receiverDO.onlineEvent(req)
                : await receiverDO.offlineEvent(req as OfflineEvent)
          } catch (error) {
            writeErrorLog(error)

            friendStatus = { status: 'offline', lastSeen: UNKNOWN_LAST_SEEN }
          }
          if (friendStatus.status === 'online') {
            const wsEvent: OnlineEvent = { userId: event.userId }
            if (status === 'online') {
              this.ws.toSockets('online', wsEvent)
            }
          }
          const chatIndex = this.chatListService.chatList.findIndex(c => c.id === event.userId)
          if (chatIndex !== -1) {
            const lastSeen = friendStatus.status === 'online' ? undefined : friendStatus.lastSeen
            let save = false
            if (
              this.chatListService.chatList[chatIndex].lastMessageStatus === 'undelivered' &&
              friendStatus.status === 'online'
            ) {
              this.chatListService.chatList[chatIndex].lastMessageStatus = 'unread'
              save = true
            }
            if (this.chatListService.chatList[chatIndex].lastSeen !== lastSeen) {
              this.chatListService.chatList[chatIndex].lastSeen = lastSeen
              save = true
            }
            if (save) {
              await this.chatListService.save()
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
      await this.state.storage.setAlarm(new Date(Date.now() + 1))
    }
  }
  async processOutgoingDlvrdQueue(): Promise<void> {
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
        } catch (e) {
          //this.#outgoingDlvrdQueue.push(event)
          console.error('Failed to process outgoing event:', e)
          await writeErrorLog(e)
          hasErrored = true
        }
      } else {
      }
    }
    await this.state.storage.put('outgoingDlvrdQueue', this.#outgoingDlvrdQueue)
    if (this.#outgoingDlvrdQueue.length) {
      this.state.storage.setAlarm(new Date(Date.now() + (hasErrored ? 3000 : 100)))
    }
  }
  async online(): Promise<ChatList> {
    // use tasks too
    this.#isOnline = true
    this.#lastSeen = undefined

    const chatList = this.chatListService.chatList

    if (!chatList) {
      return []
    }
    this.#outgoingStatusQueue = chatList
      .filter(c => c.type === 'dialog' && c.id !== this.userId)
      .map(c => ({ userId: c.id }))
    await this.state.storage.put('outgoingStatusQueue', this.#outgoingStatusQueue)

    this.state.waitUntil(this.blink())
    await this.state.storage.setAlarm(Date.now() + 100)
    return chatList
  }

  async offline() {
    this.#isOnline = false
    this.#lastSeen = Date.now()
    await this.state.storage.put('lastSeen', Date.now())
    const chatList = this.chatListService.chatList
    this.#outgoingStatusQueue = chatList
      .filter(c => c.type === 'dialog' && c.id !== this.userId)
      .map(c => ({ userId: c.id }))
    await this.state.storage.put('outgoingStatusQueue', this.#outgoingStatusQueue)

    await this.processOutgoingStatusQueue(10)
  }

  async setUserId(id: string) {
    this.userId = id
    await this.state.storage.put('userId', id)
  }

  private timestamp() {
    const current = performance.now()
    return (this.#timestamp = current > this.#timestamp ? current : ++this.#timestamp)
  }

  async sendOnlineTo(userId: string) {
    const event = {
      userId: this.userId,
    }

    let friendStatus: OnlineStatus
    try {
      const receiverDO = userStorageById(this.env, userId)

      try {
        friendStatus = await receiverDO.onlineEvent(event)
      } catch (error) {
        writeErrorLog(error)
        friendStatus = { status: 'offline', lastSeen: UNKNOWN_LAST_SEEN }
      }
      if (friendStatus.status === 'online') {
        const wsEvent: OnlineEvent = { userId }
        if (this.#isOnline) {
          this.ws.toSockets('online', wsEvent)
        }
      }
      const chatIndex = this.chatListService.chatList.findIndex(c => c.id === userId)
      if (chatIndex !== -1) {
        const lastSeen =
          friendStatus.status === 'online'
            ? undefined
            : friendStatus.lastSeen
              ? friendStatus.lastSeen
              : UNKNOWN_LAST_SEEN

        if (this.chatListService.chatList[chatIndex].lastSeen !== lastSeen) {
          this.chatListService.chatList[chatIndex].lastSeen = lastSeen
          this.chatListService.save()
        }
      }
    } catch (error) {
      await writeErrorLog(error)
    }
  }
  userId!: string
  #isOnline = false
  #lastSeen: number | undefined = UNKNOWN_LAST_SEEN
  #timestamp = Date.now()
}
