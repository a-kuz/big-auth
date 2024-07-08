import { DurableObject } from 'cloudflare:workers'
import { Profile } from '~/db/models/User'
import { getUserById } from '~/db/services/get-user'
import { NotFoundError } from '~/errors/NotFoundError'
import { displayName } from '~/services/display-name'
import { Dialog } from '~/types/Chat'
import { DialogMessage } from '~/types/ChatMessage'
import {
  GetMessagesRequest,
  GetMessagesResponse,
  MarkDeliveredRequest,
  MarkReadRequest,
  NewMessageRequest,
  ReplyTo,
} from '~/types/ws/client-requests'
import {
  MarkDeliveredInternalEvent,
  MarkReadInternalEvent,
  MessageId,
  Timestamp,
  UpdateChatInternalEvent,
} from '~/types/ws/internal'
import { MarkDlvrdResponse, MarkReadResponse, NewMessageResponse } from '~/types/ws/responses'
import { NewMessageEvent } from '~/types/ws/server-events'
import { splitArray } from '~/utils/split-array'
import { Env } from '../../types/Env'
import { Mark, MarkPointer, Marks } from '../../types/Marks'
import { DEFAULT_PORTION, MAX_PORTION } from './constants'
import { userStorage } from './utils/mdo'
import { DebugWrapper } from '../DebugWrapper'
import { MessageStatus } from '~/types/ChatList'

export class DialogsDO extends DebugWrapper {
  #timestamp = Date.now()
  #messages: DialogMessage[] = []
  #users?: [Profile, Profile]
  #id: string = ''
  #counter = 0
  #readMarks: Marks = {} // TODO: using in getMessages method – filling 'read' field in messages dynamically
  #dlvrdMarks: Marks = {} // TODO: using in getMessages method – filling 'dlvrd' field in messages dynamically
  #lastReadMark = new Map<string, MarkPointer>()
  #lastDlvrdMark = new Map<string, MarkPointer>() // TODO: initialization, storing at reading in dlvrd, read methods; using in dlvrd, read, getMessages methods
  #storage!: DurableObjectStorage
  #lastMessageOfPreviousAuthor?: DialogMessage
  #lastMessage?: DialogMessage

  constructor(
    readonly ctx: DurableObjectState,
    readonly env: Env,
  ) {
    super(ctx, env)
    console.log('Dialog constructor')
    this.#storage = ctx.storage
    this.ctx.setHibernatableWebSocketEventTimeout(1000 * 60 * 60 * 24)
    this.ctx.blockConcurrencyWhile(async () => this.initialize())
  }

  async loadMarks(
    startIndex: number,
    endIndex: number,
    userId: string,
  ): Promise<{ readMarks: Mark[]; dlvrdMarks: Mark[] }> {
    const readKeys = []
    const dlvrdKeys = []
    for (let i = startIndex; i <= endIndex; i++) {
      readKeys.push(`read-${userId}-${i}`)
      dlvrdKeys.push(`dlvrd-${userId}-${i}`)
    }

    const readMarks = new Map<string, Mark>()
    const dlvrdMarks = new Map<string, Mark>()

    const readKeyChunks = splitArray(readKeys, 128)
    const dlvrdKeyChunks = splitArray(dlvrdKeys, 128)

    for (const chunk of readKeyChunks) {
      const marksChunk = await this.#storage.get<Mark>(chunk)
      for (const [key, value] of marksChunk.entries()) {
        readMarks.set(key, value)
      }
    }

    for (const chunk of dlvrdKeyChunks) {
      const marksChunk = await this.#storage.get<Mark>(chunk)
      for (const [key, value] of marksChunk.entries()) {
        dlvrdMarks.set(key, value)
      }
    }

    for (let i = startIndex; i <= endIndex; i++) {
      const readMark = readMarks.get(`read-${userId}-${i}`)
      const dlvrdMark = dlvrdMarks.get(`dlvrd-${userId}-${i}`)
      if (readMark) {
        this.#readMarks[userId][i] = readMark
      }
      if (dlvrdMark) {
        this.#dlvrdMarks[userId][i] = dlvrdMark
      }
    }

    const readMarksArray: Mark[] = []
    const dlvrdMarksArray: Mark[] = []

    for (let i = startIndex; i <= endIndex; i++) {
      const readMark = readMarks.get(`read-${userId}-${i}`)
      const dlvrdMark = dlvrdMarks.get(`dlvrd-${userId}-${i}`)
      if (readMark) {
        this.#readMarks[userId][i] = readMark
        readMarksArray.push(readMark)
      }
      if (dlvrdMark) {
        this.#dlvrdMarks[userId][i] = dlvrdMark
        dlvrdMarksArray.push(dlvrdMark)
      }
    }

    return { readMarks: readMarksArray, dlvrdMarks: dlvrdMarksArray }
  }

  debugInfo() {
    if (this.#users) {
      return `in memory:
messages: ${this.#messages.filter(e => !!e).length},
#dlvrdMarks: ${this.#dlvrdMarks[this.#users[0].id].filter(e => !!e).length + this.#dlvrdMarks[this.#users[1].id].filter(e => !!e).length},
#readMarks: ${this.#readMarks[this.#users[0].id].filter(e => !!e).length + this.#readMarks[this.#users[1].id].filter(e => !!e).length},

#lastMessageOfPreviousAuthor: ${this.#lastMessageOfPreviousAuthor?.messageId},
#lastMessage: ${this.#lastMessage?.messageId},
#lastReadMark: ${JSON.stringify(Object.fromEntries(this.#lastReadMark.entries()))},
#lastDlvrdMark: ${JSON.stringify(Object.fromEntries(this.#lastDlvrdMark.entries()))},
messages in storage: ${this.#counter},

		`
    }
  }

  async create(owner: string, secondUser: string): Promise<Dialog> {
    if (this.#users?.length) return this.chat(owner)
    const [user1Id, user2Id] = [owner, secondUser].sort((a, b) => (a > b ? 1 : -1))
    this.#id = `${user1Id}:${user2Id}`

    const user1 = (
      await getUserById(this.env.DB, user1Id, new NotFoundError(`user ${user1Id} is not exists`))
    ).profile()

    const user2 = (
      await getUserById(this.env.DB, user2Id, new NotFoundError(`user ${user2Id} is not exists`))
    ).profile()

    this.#users = [user1, user2]

    await this.#storage.put('users', this.#users)
    await this.#storage.put('messages', [])
    await this.#storage.put('counter', 0)
    await this.#storage.put('createdAt', Date.now())

    return this.ctx.blockConcurrencyWhile(async () => {
      await this.initialize()

      return this.chat(owner)
    })
  }

  async chat(userId: string): Promise<Dialog> {
    if (!this.#users) {
      console.error("DO dialog: 'users' is not initialized")
      throw new Error("DO dialog: 'users' is not initialized")
    }
    const user2 = this.#users[0].id === userId ? this.#users[1] : this.#users[0]
    const isMine = this.#lastMessage?.sender === userId
    const lastMessageStatus = this.#lastMessage
      ? await this.messageStatus(this.#lastMessage, userId)
      : 'unread'

    const chat: Dialog = {
      chatId: user2.id,
      lastMessageId: this.#lastMessage?.messageId || this.#counter - 1,
      photoUrl: user2.avatarUrl,
      type: 'dialog',
      meta: user2,
      missed: this.missedFor(userId),
      lastMessageText: this.#lastMessage?.message,
      lastMessageTime: this.#lastMessage?.createdAt,
      lastMessageAuthor: this.#lastMessage?.sender,
      lastMessageStatus,
      isMine,
      name: displayName(user2),
    }

    return chat
  }

  async counter() {
    return this.#counter
  }

  private newId() {
    this.#counter++
    this.#storage.put('counter', this.#counter, {})
    return this.#counter - 1
  }

  async getMessages(payload: GetMessagesRequest, userId: string): Promise<GetMessagesResponse> {
    if (!this.#messages) return { messages: [], authors: [] }
    if (!payload.startId) {
      const endIndex = payload.endId || this.#messages.length
      const portion = payload.count ? Math.min(MAX_PORTION, payload.count) : DEFAULT_PORTION
      const startIndex = endIndex >= portion ? endIndex - portion + 1 : 0
      const messages = await this.loadMessages(startIndex, endIndex, userId)
      return { messages, authors: [] }
    } else {
      const portion = payload.count ? Math.min(MAX_PORTION, payload.count) : DEFAULT_PORTION
      const startIndex = payload.startId
      const endIndex = startIndex + portion - 1
      const messages = await this.loadMessages(startIndex, endIndex, userId)
      return { messages, authors: [] }
    }
  }
  async loadMessages(startId: number, endId: number, userId: string) {
    const secondUserId = this.chatIdFor(userId)
    const missedIds = []
    for (let i = startId; i <= endId; i++) {
      if (!this.#messages[i]) {
        missedIds.push(i)
      }
    }
    const keys = missedIds.map(i => `message-${i}`)
    const keyChunks = splitArray(keys, 128)

    for (const chunk of keyChunks) {
      const messagesChunk = await this.#storage.get<DialogMessage>(chunk)
      for (const key of messagesChunk.keys()) {
        const i = keys.indexOf(key)
        const message = messagesChunk.get(key)
        if (message) {
          this.#messages[message.messageId] = message
        }
      }
    }
    const messages = this.#messages.slice(startId, endId + 1).filter(m => !!m)

    if (messages.length === 0) {
      return messages
    }

    // Find the mark for the lowest messageId

    const { readMarks, dlvrdMarks } = await this.loadMarks(startId, endId, secondUserId)
    let readMark = readMarks.length ? readMarks[0] : undefined
    let dlvrdMark = dlvrdMarks.length ? dlvrdMarks[0] : undefined
    // Use cached #readMarks and #dlvrdMarks
    for (const message of messages) {
      message.read = undefined
      message.dlvrd = undefined
      // if (message.sender !== userId) continue
			message.status = this.messageStatus(message, userId)
			message.read = message.status === 'read' ? 1 : undefined
			message.dlvrd = message.status === 'read'||message.status === 'unread' ? 1 : undefined

      // if (readMark) {
      //   if (readMark[0] < message.messageId) {
      //     readMark = readMarks[readMarks.indexOf(readMark) + 1] ?? undefined
      //   }
      // }
      // if (dlvrdMark) {
      //   if (dlvrdMark[0] < message.messageId) {
      //     dlvrdMark = dlvrdMarks[dlvrdMarks.indexOf(dlvrdMark) + 1] ?? undefined
      //   }
      // }

      // message.read = readMark ? readMark[1] : undefined
      // message.dlvrd = dlvrdMark ? dlvrdMark[1] : undefined
    }
    return messages
  }

  async #message(messageId: number) {
    let message: DialogMessage | undefined = this.#messages[messageId]
    if (message) {
      return message
    }
    message = await this.#storage.get<DialogMessage>(`message-${messageId}`)
    if (message) {
      this.#messages[messageId] = message
    }
    return message
  }

  async newMessage(sender: string, request: NewMessageRequest): Promise<NewMessageResponse> {
    const timestamp = this.timestamp()
    const messageId = await this.newId()
    let replyTo: ReplyTo | undefined
    if (request.replyTo) {
      const replyToMessage = await this.#message(request.replyTo)
      if (replyToMessage) {
        replyTo = {
          clientMessageId: replyToMessage.clientMessageId,
          messageId: replyToMessage.messageId,
          createdAt: replyToMessage.createdAt,
          sender: replyToMessage.sender,
          message: replyToMessage.message,
        }
      }
    }
    const message: DialogMessage = {
      createdAt: timestamp,
      messageId,
      sender: sender,
      message: request.message,
      attachments: request.attachments,
      clientMessageId: request.clientMessageId,
      replyTo,
    }
    this.#messages[messageId] = message
    const prevMessage = this.#lastMessage
    this.#lastMessage = message
    await this.#storage.put<DialogMessage>(`message-${messageId}`, message)
    if (messageId > 0 && prevMessage && prevMessage.sender !== sender) {
      await this.read(sender, { chatId: request.chatId, messageId: messageId - 1 }, timestamp)
      this.#lastMessageOfPreviousAuthor = prevMessage
    }
    await this.sendNewEventToReceiver(request.chatId, message, timestamp)

    return { messageId, timestamp, clientMessageId: message.clientMessageId }
  }

  async dlvrd(
    sender: string,
    request: MarkDeliveredRequest,
    timestamp: number,
  ): Promise<MarkDlvrdResponse> {
    const messageId = request.messageId ?? this.#counter - 1
    const message = await this.#message(messageId)
    if (!message) {
      throw new Error(`messageId is not exists`)
    }

    const mark: Mark = [messageId, timestamp]
    const markPointer = { index: this.#dlvrdMarks[sender].length, messageId, timestamp }
    this.#lastDlvrdMark.set(sender, markPointer)
    await this.#storage.put<MarkPointer>(`lastDlvrd-${sender}`, markPointer)
    this.#dlvrdMarks[sender].push(mark)
    await this.#storage.put<Mark>(`dlvrd-${sender}-${this.#dlvrdMarks[sender].length - 1}`, mark)

    await this.sendDlvrdEventToAuthor(request.chatId, message, timestamp)
    return { messageId, timestamp }
  }

  async read(
    sender: string,
    request: MarkReadRequest,
    timestamp: Timestamp,
  ): Promise<MarkReadResponse> {
    if (request.messageId && request.messageId > this.#counter - 1) {
      throw new Error(`messageId is not exists`)
    }

    const messageId: MessageId = request.messageId ?? this.#counter - 1
    const message = (await this.#message(messageId))!
    const clientMessageId = message.clientMessageId
    const readMark = await this.findMark(sender, messageId, 'read')
    const read = readMark ? readMark.timestamp : 0

    const result = {
      chatId: request.chatId,
      messageId,
      clientMessageId,
      timestamp: read || timestamp,
      missed: this.missedFor(sender),
    }
    const lastRead = this.#lastReadMark.get(sender)?.messageId
    if (lastRead && lastRead >= messageId) {
      return result
    }

    if (message?.sender === sender) {
      return result
    }

    const mark: Mark = [messageId, timestamp]
    const markPointer = { index: this.#readMarks[sender].length, messageId, timestamp }
    this.#lastReadMark.set(sender, markPointer)
    await this.#storage.put<MarkPointer>(`lastRead-${sender}`, markPointer)
    this.#readMarks[sender].push(mark)
    await this.#storage.put<Mark>(`read-${sender}-${this.#readMarks[sender].length - 1}`, mark)

    await this.sendReadEventToAuthor(request.chatId, message, timestamp)

    return {
      chatId: request.chatId,
      messageId,
      clientMessageId,
      timestamp,
      missed: this.missedFor(sender),
    }
  }

  private async findMark(
    userId: string,
    messageId: number,
    markType: 'read' | 'dlvrd',
  ): Promise<MarkPointer | undefined> {
    let last, marks
    if (markType === 'read') {
      last = this.#lastReadMark.get(userId)
      marks = this.#readMarks[userId] || []
    } else {
      last = this.#lastDlvrdMark.get(userId)
      marks = this.#dlvrdMarks[userId] || []
    }

    if (!last) return undefined

    if (last.messageId < messageId) {
      return undefined
    }

    let low = 0
    let high = last.index

    while (low < high) {
      const mid = Math.floor((low + high) / 2)
      const midMark = marks[mid] || (await this.#storage.get<Mark>(`read-${userId}-${mid}`))
      if (midMark) {
        this.#readMarks[userId][mid] = midMark
      }
      if (midMark && midMark[0] < messageId) {
        low = mid + 1
      } else {
        high = mid
      }
    }

    const readIndex = low < marks.length && marks[low][0] >= messageId ? low : -1
    if (readIndex === -1) return undefined
    const mark = this.#readMarks[userId][readIndex]
    return { index: readIndex, messageId: mark[0], timestamp: mark[1] }
  }

  private async sendDlvrdEventToAuthor(
    receiverId: string,
    message: DialogMessage,
    timestamp: number,
  ) {
    const receiverDO = userStorage(this.env, receiverId)

    // Create an event object with message details and timestamp
    const event: MarkDeliveredInternalEvent = {
      chatId: this.chatIdFor(receiverId),
      messageId: message.messageId,
      clientMessageId: message.clientMessageId,
      timestamp,
    }

    const body = JSON.stringify(event)

    const resp = await receiverDO.fetch(
      new Request(`${this.env.ORIGIN}/${receiverId}/dialog/event/dlvrd`, {
        method: 'POST',
        body,
      }),
    )

    if (resp.status !== 200) {
      console.error(await resp.text())
      throw new Error("Couldn't send event")
    }
  }

  private chatIdFor(userId: string): string {
    return this.#id.replace(userId, '').replace(':', '')
  }

  private async sendReadEventToAuthor(
    receiverId: string,
    message: DialogMessage,
    timestamp: number,
  ) {
    const receiverDO = userStorage(this.env, receiverId)
    const senderId = this.chatIdFor(receiverId)
    // Create an event object with message details and timestamp
    const event: MarkReadInternalEvent = {
      chatId: senderId,
      messageId: message.messageId,
      clientMessageId: message.clientMessageId,
      timestamp,
    }

    const body = JSON.stringify(event)

    const resp = await receiverDO.fetch(
      new Request(`${this.env.ORIGIN}/${receiverId}/dialog/event/read`, {
        method: 'POST',
        body,
      }),
    )

    if (resp.status !== 200) {
      console.error(await resp.text())
      throw new Error("Couldn't send event")
    }
  }

  private async sendNewEventToReceiver(
    receiverId: string,
    message: DialogMessage,
    timestamp: number,
  ) {
    const receiverDO = userStorage(this.env, receiverId)
    const senderId = this.chatIdFor(receiverId)

    const event: NewMessageEvent = {
      messageId: message.messageId,
      sender: senderId,
      chatId: senderId,
      message: message.message,
      attachments: message.attachments,
      clientMessageId: message.clientMessageId,
      timestamp,
      missed: this.missedFor(receiverId),
    }
    const body = JSON.stringify(event)
    const resp = await receiverDO.fetch(
      new Request(`${this.env.ORIGIN}/${receiverId}/dialog/event/new`, {
        method: 'POST',
        body,
      }),
    )
    if (resp.status !== 200) {
      console.error(await resp.text())
      console.error("couldn't send event")
      throw new Error("Couldn't send event")
    } else {
      const { dlvrd = false } = await resp.json<{ dlvrd?: boolean }>()
      if (dlvrd) {
        this.dlvrd(receiverId, { chatId: senderId, messageId: message.messageId }, this.timestamp())
      }
    }
  }
  private missedFor(userId: string): number {
    if (this.#lastMessage?.sender === userId) {
      return 0
    }
    const lastReadMark = this.#lastReadMark?.get(userId)
    let currentBlockOfMessagesOfOneAuthorLength = (this.#lastMessage?.messageId || 0) + 1
    if (this.#lastMessageOfPreviousAuthor) {
      currentBlockOfMessagesOfOneAuthorLength -= this.#lastMessageOfPreviousAuthor.messageId
    }

    return lastReadMark
      ? Math.min(
          this.#counter - lastReadMark.messageId - 1,
          currentBlockOfMessagesOfOneAuthorLength - 1,
        )
      : currentBlockOfMessagesOfOneAuthorLength - 1
  }

  private async initialize() {
    if (!this.#users || !this.#users.length) {
      this.#users = await this.#storage.get('users')
    }
    this.#counter = (await this.#storage.get<number>('counter')) || 0
    if (this.#users) {
      this.#id = `${this.#users[0].id}:${this.#users[1].id}`

      for (const user of this.#users) {
        this.#readMarks[user.id] = []
        this.#dlvrdMarks[user.id] = []

        const lastReadMark = await this.#storage.get<MarkPointer>(`lastRead-${user.id}`)
        if (lastReadMark) {
          this.#lastReadMark.set(user.id, lastReadMark)
          this.#readMarks[user.id][lastReadMark.index] = [
            lastReadMark.messageId,
            lastReadMark.timestamp,
          ]
        }

        const lastDlvrdMark = await this.#storage.get<MarkPointer>(`lastDlvrd-${user.id}`)
        if (lastDlvrdMark) {
          this.#lastDlvrdMark.set(user.id, lastDlvrdMark)
          this.#dlvrdMarks[user.id][lastDlvrdMark.index] = [
            lastDlvrdMark.messageId,
            lastDlvrdMark.timestamp,
          ]
        }
      }
    }
    this.#messages = []

    let indexCandidat = this.#counter
    if (this.#counter) {
      let lastMessageCandidat = await this.getLastMessage(indexCandidat)
      if (lastMessageCandidat) {
        this.#lastMessage = lastMessageCandidat
        this.#messages[this.#lastMessage.messageId] = this.#lastMessage
      }
    }
    if (this.#lastMessage) {
      let i = this.#lastMessage.messageId - 1
      while (i >= 0) {
        const message = await this.#message(i)
        if (message && message.sender !== this.#lastMessage.sender) {
          this.#lastMessageOfPreviousAuthor = message
          break
        }
        i--
      }
    }
  }
  private messageStatus(message: DialogMessage, userId: string): MessageStatus {
    const id = this.chatIdFor(message.sender)
    const isRead = this.isMarked(message.messageId, id, 'read')
    if (isRead) return 'read'

    const isDelivered = this.isMarked(message.messageId, id, 'dlvrd')
    if (isDelivered) return 'unread'

    return 'undelivered'
  }

  private async getLastMessage(index: number): Promise<DialogMessage | null> {
    let lastMessage: DialogMessage | null = null
    const keys = []
    while (index >= 0 && keys.length < 128) {
      keys.push(`message-${index}`)
      index--
    }
    let maxIndex = -1
    const messagesChunk = await this.#storage.get<DialogMessage>(keys)
    for (const [key, message] of messagesChunk.entries()) {
      const messageIndex = parseInt(key.split('-')[1])
      this.#messages[messageIndex] = message
      if (maxIndex < messageIndex) {
        lastMessage = message
        maxIndex = messageIndex
      }
    }

    if (!lastMessage) {
      return this.getLastMessage(index)
    }
    return lastMessage
  }
  private isMarked(messageId: number, userId: string, markType: 'read' | 'dlvrd'): boolean {
    const lastMark = (markType === 'read' ? this.#lastReadMark : this.#lastDlvrdMark).get(userId)
    if (!lastMark) return false
    return lastMark.messageId >= messageId
  }

  private timestamp() {
    const current = performance.now()
    return (this.#timestamp = current > this.#timestamp ? current : ++this.#timestamp)
  }


  async updateProfile(profile: Profile) {
    if (!this.#users) return
    const index = this.#users.findIndex(user => user.id === profile.id)
    if (index >= 0) {
      this.#users[index] = profile
    }
    await this.ctx.storage.put('users', this.#users)
    const index2 = (index - 1) * -1
    const receiverId = this.#users[index2].id
    const receiverDO = userStorage(this.env, receiverId)
    const event: UpdateChatInternalEvent = await this.chat(receiverId)

    const reqBody = JSON.stringify(event)

    const resp = await receiverDO.fetch(
      new Request(`${this.env.ORIGIN}/${receiverId}/dialog/event/updateChat`, {
        method: 'POST',
        body: reqBody,
      }),
    )
  }
}
