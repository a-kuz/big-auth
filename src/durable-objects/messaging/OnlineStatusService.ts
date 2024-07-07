import { ChatList } from '~/types/ChatList'
import { Env } from '~/types/Env'
import { OnlineEvent } from '~/types/ws/server-events'
import { writeErrorLog } from '~/utils/serialize-error'
import { ChatListService } from './ChatListService'
import { chatStorage, userStorage } from './utils/mdo'
import { WebSocketGod } from './WebSocketService'
export type OnlineStatus = { lastSeen?: number; status: 'online' | 'offline' }
export const UNKNOWN_LAST_SEEN = 1719781200000 // 2024-07-01
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
    this.#lastSeen = (await this.state.storage.get<number>('lastSeen')) || UNKNOWN_LAST_SEEN
    this.#outgoingStatusQueue =
      (await this.state.storage.get<{ userId: string }[]>('outgoingStatusQueue')) || []
    this.#outgoingDlvrdQueue =
      (await this.state.storage.get<{ chatId: string }[]>('outgoingDlvrdQueue')) || []
    this.userId = (await this.state.storage.get<string>('userId')) || this.userId
  }

  isOnline() {
    return this.#isOnline
  }

  async lastSeenOf(userId: string): Promise<number | undefined> {
    const mdo = await userStorage(this.env, userId)
    const lastSeenResponse = await mdo.fetch(
      new Request(`${this.env.ORIGIN}/${userId}/messaging/request/lastSeen`, {
        method: 'POST',
        body: '{}',
      }),
    )
    const onlineStatus = await lastSeenResponse.json<OnlineStatus>()

    if (onlineStatus.status === 'online') {
      return undefined
    } else {
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
      this.#outgoingDlvrdQueue.push({ chatId: chat.id })
      const receiverDO = chatStorage(this.env, chat.id, this.userId)
      await receiverDO.dlvrd(this.userId, { chatId: chat.id }, timestamp)
      chat.lastMessageStatus = 'unread'
      this.chatListService.save()
    }
    await this.state.storage.put('outgoingDlvrdQueue', this.#outgoingDlvrdQueue)
  }

  async processOutgoingStatusQueue(eventsPerProcessing = 3): Promise<void> {
    const { status } = this.status()
    const reqBody = JSON.stringify({
      userId: this.userId,
      ...(status === 'online' ? {} : { lastSeen: this.#lastSeen || Date.now() }),
    })
    console.log(reqBody)

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

            friendStatus = { status: 'offline', lastSeen: UNKNOWN_LAST_SEEN }
          }
          if (friendStatus.status === 'online') {
            const wsEvent: OnlineEvent = { userId: event.userId }
            if (status === 'online') {
              this.ws.toBuffer('online', wsEvent)
            }
          } else {
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
      this.state.storage.setAlarm(new Date(Date.now() + 1000))
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
    await this.state.storage.setAlarm(Date.now() + 100)
    this.state.waitUntil(async () => this.processOutgoingStatusQueue(20))
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
    const body = JSON.stringify({
      userId: this.userId,
    })
    let resp: Response, friendStatus: OnlineStatus
    try {
      const receiverDO = userStorage(this.env, userId)

      const url = `${this.env.ORIGIN}/${userId}/messaging/event/online`
      try {
        resp = await receiverDO.fetch(url, { body, method: 'POST' })
        friendStatus = await resp.json<OnlineStatus>()
      } catch (error) {
        writeErrorLog(error)
        if (resp!) console.log('!!!!! FRIEND', await resp.clone().text())

        friendStatus = { status: 'offline', lastSeen: UNKNOWN_LAST_SEEN }
      }
      if (friendStatus.status === 'online') {
        const wsEvent: OnlineEvent = { userId }
        if (this.#isOnline) {
          this.ws.toBuffer('online', wsEvent)
        }
      } else {
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
