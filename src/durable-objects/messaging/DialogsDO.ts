import { Profile } from '~/db/models/User'
import { getUserById } from '~/db/services/get-user'
import { NotFoundError } from '~/errors/NotFoundError'
import { displayName } from '~/services/display-name'
import { Dialog } from '~/types/Chat'
import { MessageStatus } from '~/types/ChatList'
import { CallOnMessage, CallPayload, DialogMessage, StoredDialogMessage } from '~/types/ChatMessage'
import { ServerEventType } from '~/types/ws'
import {
  CallNewMessageRequest,
  DeleteRequest,
  EditMessageRequest,
  GetMessagesRequest,
  GetMessagesResponse,
  MarkDeliveredRequest,
  MarkReadRequest,
  NewMessageRequest,
  ReplyTo,
} from '~/types/ws/client-requests'
import { dlt, edit } from '~/types/ws/event-literals'
import {
  CloseCallEvent,
  MarkDeliveredInternalEvent,
  MarkReadInternalEvent,
  MessageId,
  Timestamp,
  UpdateChatInternalEvent,
  UserId,
} from '~/types/ws/internal'
import { ServerEventPayload } from '~/types/ws/payload-types'
import {
  DeleteResponse,
  MarkDlvrdResponse,
  MarkReadResponse,
  NewMessageResponse,
} from '~/types/ws/responses'
import { DeleteEvent, EditEvent, NewMessageEvent } from '~/types/ws/server-events'
import { callDesription } from '~/utils/call-description'
import { newId } from '~/utils/new-id'
import { splitArray } from '~/utils/split-array'
import { Env } from '../../types/Env'
import { Mark, MarkPointer, Marks } from '../../types/Marks'
import { DebugableDurableObject } from '../DebugableDurableObject'
import { DEFAULT_PORTION, MAX_PORTION } from './constants'
import { userStorageById } from './utils/get-durable-object'
import { messagePreview } from './utils/message-preview'

export type Missed = { missed: number; firstMissed?: string }
export class DialogsDO extends DebugableDurableObject {
  #timestamp = Date.now()
  #messages: StoredDialogMessage[] = []
  #users?: [Profile, Profile]
  #id: string = ''
  #counter = 0
  #readMarks: Marks = {}
  #dlvrdMarks: Marks = {}
  #lastReadMark = new Map<string, MarkPointer>()
  #lastDlvrdMark = new Map<string, MarkPointer>()
  #storage!: DurableObjectStorage
  #lastMessageOfPreviousAuthor?: StoredDialogMessage
  #lastMessage?: StoredDialogMessage

  constructor(
    readonly ctx: DurableObjectState,
    readonly env: Env,
  ) {
    super(ctx, env)
    console.log('Dialog constructor')
    this.#storage = ctx.storage
    this.ctx.setHibernatableWebSocketEventTimeout(1000 * 60 * 60 * 24)
    this.initialize()
  }

  private async initialize() {
    await this.ctx.blockConcurrencyWhile(async () => {
      await this.loadInitialData()
    })
  }

  async debugInfo() {
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
    } else {
      return 'O'
    }
  }

  async create(owner: string, secondUser: string): Promise<Dialog> {
    if (this.#users?.length) return this.chat(owner)
    const [user1Id, user2Id] = [owner, secondUser].sort((a, b) => (a > b ? 1 : -1))
    this.#id = `${user1Id}:${user2Id}`

    const user1 = (
      await getUserById(
        this.env.DB,
        user1Id,
        new NotFoundError(`user ${user1Id} is not exists (from dialog)`),
      )
    ).profile()

    const user2 = (
      await getUserById(
        this.env.DB,
        user2Id,
        new NotFoundError(`user ${user2Id} is not exists (from dialog)`),
        'Dialog-2',
      )
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
      ...(await this.missedFor(userId)),
      lastMessageText: messagePreview(this.#lastMessage?.message),
      lastMessageTime: this.#lastMessage?.createdAt || await this.#storage.get('createdAt') || 0,
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

  async getMessages(payload: GetMessagesRequest, userId: string): Promise<GetMessagesResponse> {
    if (!this.#messages) return { messages: [], authors: [] }
    if (!payload.startId) {
      const endIndex = payload.endId || this.#messages.length
      const portion = payload.count ? Math.min(MAX_PORTION, payload.count) : DEFAULT_PORTION
      const startIndex = endIndex >= portion ? endIndex - portion + 1 : 0
      const messages = (await this.loadMessages(startIndex, endIndex, userId)).map(m =>
        this.prepareStoredMessage(m, userId),
      )
      return { messages, authors: [] }
    } else {
      const portion = payload.count ? Math.min(MAX_PORTION, payload.count) : DEFAULT_PORTION
      const startIndex = payload.startId
      const endIndex = startIndex + portion - 1
      const messages = (await this.loadMessages(startIndex, endIndex, userId)).map(m =>
        this.prepareStoredMessage(m, userId),
      )
      return { messages, authors: [] }
    }
  }

  async deleteMessage(sender: UserId, request: DeleteRequest): Promise<DeleteResponse> {
    const { originalMessageId, chatId } = request
    const message = await this.message(originalMessageId)
    if (!message) {
      throw new Error(`Message with ID ${originalMessageId} does not exist`)
    }
    message.deletedAt = this.timestamp()
    message.message = undefined
    message.attachments = undefined
    await this.#storage.put(`message-${originalMessageId}`, message)

    const messageId = this.newId()
    const clientMessageId = `dlt-${messageId}-${newId(3)}`
    const serviceMessage: StoredDialogMessage = {
      messageId,
      clientMessageId,
      sender,
      type: 'delete',
      payload: { originalMessageId },
      createdAt: message.deletedAt,
    }

    this.#messages[serviceMessage.messageId] = serviceMessage
    await this.#storage.put(`message-${serviceMessage.messageId}`, serviceMessage)
    const receiverId = chatId
    const receiverChatId = this.chatIdFor(receiverId) // = sender ^)

    const deleteMessageEvent: DeleteEvent = {
      originalMessageId,
      chatId: receiverChatId,
      messageId,
    }

    await this.sendEventToReceiver<dlt>(receiverId, 'delete', deleteMessageEvent)

    return { messageId, timestamp: message.deletedAt }
  }

  async newMessage(sender: string, request: NewMessageRequest): Promise<NewMessageResponse> {
    const timestamp = this.timestamp()
    const messageId = await this.newId()
    let replyTo: ReplyTo | undefined
    if (request.replyTo) {
      const replyToMessage = await this.message(request.replyTo)
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
    const message: StoredDialogMessage = {
      createdAt: timestamp,
      messageId,
      sender: sender,
      message: request.message,
      attachments: request.attachments,
      clientMessageId: request.clientMessageId,
      replyTo,
      forwarded: request.forwarded,
    }
    this.#messages[messageId] = message
    const prevMessage = this.#lastMessage
    this.#lastMessage = message
    await this.#storage.put<StoredDialogMessage>(`message-${messageId}`, message)
    if (messageId > 0 && prevMessage && prevMessage.sender !== sender) {
      await this.read(sender, { chatId: request.chatId, messageId: messageId - 1 }, timestamp)
      this.#lastMessageOfPreviousAuthor = prevMessage
    }
    await this.sendNewEventToReceiver(request.chatId, message, timestamp)

    return { messageId, timestamp, clientMessageId: message.clientMessageId }
  }

  async closeCall(
    sender: string,
    request: CallNewMessageRequest,
  ): Promise<NewMessageResponse | void> {
    console.log(sender, request)
    const timestamp = this.timestamp()
    const messageId = await this.newId()
    const message: StoredDialogMessage = {
      createdAt: timestamp,
      messageId,
      sender: sender,
      clientMessageId: newId(),
      type: 'call',
      payload: request.payload,
    }
    this.#messages[messageId] = message
    const prevMessage = this.#lastMessage
    this.#lastMessage = message

    await this.#storage.put<StoredDialogMessage>(`message-${messageId}`, message)

    if (messageId > 0 && prevMessage && prevMessage.sender !== sender) {
      await this.read(sender, { chatId: request.chatId, messageId: messageId - 1 }, timestamp)
      this.#lastMessageOfPreviousAuthor = prevMessage
    }
    if (request.payload.participants) {
      await Promise.all([
        this.sendCloseCallToReceiver(request.payload.caller, request.payload, messageId),
        this.sendCloseCallToReceiver(request.chatId, request.payload, messageId),
      ])
    }
    return { messageId, timestamp, clientMessageId: message.clientMessageId }
  }

  async sendCloseCallToReceiver(receiverId: string, payload: CallPayload, messageId: number) {
    const senderId = this.chatIdFor(receiverId)
    const event: CloseCallEvent = {
      chatId: senderId,
      callId: payload.callId,
      callType: payload.callType,
      status: payload.participants && payload.participants.length > 1 ? 'received' : 'missed',
      direction: payload.caller == receiverId ? 'outgoing' : 'incoming',
      messageId,
      ...(await this.missedFor(receiverId)),
    }

    await this.sendEventToReceiver(receiverId, 'closeCall', event)
  }

  async dlvrd(
    sender: string,
    request: MarkDeliveredRequest,
    timestamp: number,
  ): Promise<MarkDlvrdResponse> {
    const messageId = request.messageId ?? this.#counter - 1
    const message = await this.message(messageId)
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

    const messageId: MessageId = request.messageId ?? this.#lastMessage?.messageId ?? -1
    if (messageId < 0) {
      return {
        messageId,
        timestamp,
        chatId: request.chatId,
        clientMessageId: messageId.toString(),
        missed: 0,
        // @ts-ignore
        err: 'shlem read v pustoy chat',
      }
    }
    const message = (await this.message(messageId))!
    const clientMessageId = message.clientMessageId
    const readMark = await this.findMark(sender, messageId, 'read')
    const read = readMark ? readMark.timestamp : 0

    const result = {
      chatId: request.chatId,
      messageId,
      clientMessageId,
      timestamp: read || timestamp,
      ...(await this.missedFor(sender)),
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
      ...(await this.missedFor(sender)),
    }
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
    const event: UpdateChatInternalEvent = await this.chat(receiverId)
    const receiverDO = userStorageById(this.env, receiverId)

    await receiverDO.updateChatEvent(event)
  }

  async editMessage(sender: string, payload: EditMessageRequest) {
    const { chatId, originalMessageId, message, attachments } = payload
    const timestamp = this.timestamp()
    const messageToEdit = await this.message(originalMessageId)
    if (!messageToEdit) {
      throw new Error(`Message with ID ${originalMessageId} does not exist`)
    }
    messageToEdit.message = message
    messageToEdit.attachments = attachments
    messageToEdit.updatedAt = timestamp
    await this.#storage.put(`message-${originalMessageId}`, messageToEdit)

    const messageId = this.newId()
    const clientMessageId = `edit-${messageId}-${newId(10)}`
    const serviceMessage: StoredDialogMessage = {
      messageId,
      clientMessageId,
      sender,
      type: 'edit',
      payload: { originalMessageId },
      createdAt: timestamp,
      message,
    }

    this.#messages[serviceMessage.messageId] = serviceMessage
    await this.#storage.put(`message-${serviceMessage.messageId}`, serviceMessage)

    const editMessageEvent: EditEvent = {
      chatId: sender,
      userId: this.chatIdFor(sender),
      messageId: originalMessageId,
      message,
    }

    await this.sendEventToReceiver<edit>(this.chatIdFor(sender), 'edit', editMessageEvent)

    return { messageId, timestamp }
  }

  private newId() {
    this.#counter++
    this.#storage.put('counter', this.#counter, {})
    return this.#counter - 1
  }

  private prepareStoredMessage(message: StoredDialogMessage, userId: string): DialogMessage {
    if (message.type != 'call') return message as DialogMessage
    if (message.payload) {
      const payload: CallPayload = message.payload as CallPayload
      const call: CallOnMessage = {
        callType: payload.callType,
        status: payload.participants && payload.participants.length > 1 ? 'received' : 'missed',
        direction: payload.caller == userId ? 'outgoing' : 'incoming',
      }
      message.message = callDesription(call)
      const preparadMessageOnCall: DialogMessage = {
        ...message,
        payload: call,
      }
      return preparadMessageOnCall
    }
    return message as DialogMessage
  }

  private async loadMessages(startId: number, endId: number, userId: string) {
    const secondUserId = this.chatIdFor(userId)
    const missedIds = this.getMissedMessageIds(startId, endId)
    const keys = missedIds.map(i => `message-${i}`)
    const keyChunks = splitArray(keys, 128)

    await this.loadMessagesFromStorage(keyChunks, keys)

    const messages = this.#messages.slice(startId, endId + 1).filter(m => !!m)

    if (messages.length === 0) {
      return messages
    }

    await this.loadMarks(startId, endId, secondUserId)

    return messages.map(message => {
      const status = this.messageStatus(message, message.sender)
      const read = status === 'read' ? 1 : undefined
      const dlvrd = read || status === 'unread' ? 1 : undefined
      return { ...message, status, read, dlvrd }
    })
  }

  private async message(messageId: number) {
    let message: StoredDialogMessage | undefined = this.#messages[messageId]
    if (message) {
      return message
    }
    message = await this.#storage.get<StoredDialogMessage>(`message-${messageId}`)
    if (message) {
      this.#messages[messageId] = message
    }
    return message
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
    message: StoredDialogMessage,
    timestamp: number,
  ) {
    const receiverDO = userStorageById(this.env, receiverId)

    // Create an event object with message details and timestamp
    const event: MarkDeliveredInternalEvent = {
      chatId: this.chatIdFor(receiverId),
      messageId: message.messageId,
      clientMessageId: message.clientMessageId!,
      timestamp,
    }

    await receiverDO.dlvrdEvent(event)
  }

  private chatIdFor(userId: string): string {
    return this.#id.replace(userId, '').replace(':', '')
  }

  private async sendEventToReceiver<T extends ServerEventType>(
    receiverId: string,
    eventType: T,
    event: ServerEventPayload,
  ) {
    const receiverDO = userStorageById(this.env, receiverId)
    switch (eventType as ServerEventType) {
      case 'delete':
        await receiverDO.deleteEvent(event as DeleteEvent)
        return
      case 'closeCall':
        await receiverDO.closeCallEvent(event as CloseCallEvent)
        return
      default:
        //@ts-ignore
        receiverDO[`${eventType}Event`](event)
    }
  }

  private async sendReadEventToAuthor(
    receiverId: string,
    message: StoredDialogMessage,
    timestamp: number,
  ) {
    const receiverDO = userStorageById(this.env, receiverId)
    const senderId = this.chatIdFor(receiverId)
    const event: MarkReadInternalEvent = {
      chatId: senderId,
      messageId: message.messageId,
      clientMessageId: message.clientMessageId,
      timestamp,
    }

    await receiverDO.readEvent(event)
  }

  private async sendNewEventToReceiver(
    receiverId: string,
    message: StoredDialogMessage,
    timestamp: number,
  ) {
    const receiverDO = userStorageById(this.env, receiverId)
    const senderId = this.chatIdFor(receiverId)

    const event: NewMessageEvent = {
      messageId: message.messageId,
      sender: senderId,
      chatId: senderId,
      message: message.message,
      attachments: message.attachments,
      clientMessageId: message.clientMessageId,
      timestamp,
      ...(await this.missedFor(receiverId)),
      replyTo: message.replyTo,
      forwarded: message.forwarded,
    }

    const resp = await receiverDO.newEvent(event)

    const { dlvrd = false } = await resp
    if (dlvrd) {
      this.dlvrd(receiverId, { chatId: senderId, messageId: message.messageId }, this.timestamp())
    }
  }

  private async missedFor(userId: string): Promise<Missed> {
    const { missed, visibleMissed } = await this.missedCountFor(userId)
    if (!missed || !this.#lastMessage) {
      return { missed: 0, firstMissed: undefined }
    }

    const i = this.#lastMessage.messageId - missed + 1
    const firstMissed = (await this.message(i))?.clientMessageId

    return { missed: visibleMissed, firstMissed }
  }

  private async missedCountFor(userId: string) {
    if (this.#lastMessage?.sender === userId) {
      return { missed: 0, visibleMissed: 0 }
    }
    const lastReadMark = this.#lastReadMark?.get(userId)
    if (!lastReadMark && !this.#lastMessageOfPreviousAuthor)
      return {
        missed: this.#counter,
        visibleMissed: this.#counter - (await this.serviceMessagesCount(this.#counter, userId)),
      }
    let currentBlockOfMessagesOfOneAuthorLength = this.#lastMessage?.messageId
      ? this.#lastMessage.messageId
      : 1
    if (this.#lastMessageOfPreviousAuthor) {
      currentBlockOfMessagesOfOneAuthorLength -= this.#lastMessageOfPreviousAuthor.messageId
    }

    const missed = lastReadMark
      ? Math.min(
          this.#counter - lastReadMark.messageId - 1,
          currentBlockOfMessagesOfOneAuthorLength,
        )
      : currentBlockOfMessagesOfOneAuthorLength
    const visibleMissed = missed - (await this.serviceMessagesCount(missed, userId))
    return { missed, visibleMissed }
  }

  private async serviceMessagesCount(missed: number, userId: string) {
    if (this.#lastMessage) {
      const messages = await this.loadMessages(
        this.#lastMessage.messageId - missed + 1,
        this.#lastMessage.messageId,
        userId,
      )
      const serviceMessagesCount = messages.filter(
        m => m.type === 'delete' || m.type === 'edit',
      ).length
      return serviceMessagesCount
    }
    return 0
  }

  private async loadInitialData() {
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
        const message = await this.message(i)
        if (message && message.sender !== this.#lastMessage.sender) {
          this.#lastMessageOfPreviousAuthor = message
          break
        }
        i--
      }
    }
  }

  private messageStatus(message: StoredDialogMessage, userId: string): MessageStatus {
    const id = this.chatIdFor(message.sender)

    if (message.deletedAt) return 'deleted'
    const isRead = this.isMarked(message.messageId, id, 'read')
    if (isRead) return 'read'

    const isDelivered = this.isMarked(message.messageId, id, 'dlvrd')
    if (isDelivered) return 'unread'

    return 'undelivered'
  }

  private async getLastMessage(index: number): Promise<StoredDialogMessage | null> {
    let lastMessage: StoredDialogMessage | null = null
    const keys = []
    while (index >= 0 && keys.length < 128) {
      keys.push(`message-${index}`)
      index--
    }
    let maxIndex = -1
    const messagesChunk = await this.#storage.get<StoredDialogMessage>(keys)
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

  private async loadMarks(
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

  private isMarked(messageId: number, userId: string, markType: 'read' | 'dlvrd'): boolean {
    const lastMark = (markType === 'read' ? this.#lastReadMark : this.#lastDlvrdMark).get(userId)
    if (!lastMark) return false
    return lastMark.messageId >= messageId
  }

  private timestamp() {
    const current = performance.now()
    return (this.#timestamp = current > this.#timestamp ? current : ++this.#timestamp)
  }

  private getMissedMessageIds(startId: number, endId: number): number[] {
    const missedIds = []
    for (let i = startId; i <= endId; i++) {
      if (!this.#messages[i]) {
        missedIds.push(i)
      }
    }
    return missedIds
  }

  private async loadMessagesFromStorage(keyChunks: string[][], keys: string[]) {
    for (const chunk of keyChunks) {
      const messagesChunk = await this.#storage.get<StoredDialogMessage>(chunk)
      for (const key of messagesChunk.keys()) {
        const i = keys.indexOf(key)
        const message = messagesChunk.get(key)
        if (message) {
          this.#messages[message.messageId] = message
        }
      }
    }
  }
}
