import { DialogMessage } from '~/types/ChatMessage'
import {
  GetMessagesRequest,
  GetMessagesResponse,
  MarkDeliveredRequest,
  MarkReadRequest,
  NewMessageRequest,
} from '~/types/ws/client-requests'
import { MarkDlvrdResponse, MarkReadResponse, NewMessageResponse } from '~/types/ws/responses'
import { NewMessageEvent } from '~/types/ws/server-events'
import { Env } from '../../types/Env'

import { DurableObject } from 'cloudflare:workers'
import { TM_DurableObject, Task } from 'do-taskmanager'
import { Profile } from '~/db/models/User'
import { getUserById } from '~/db/services/get-user'
import { NotFoundError } from '~/errors/NotFoundError'
import { displayName } from '~/services/display-name'
import { Dialog } from '~/types/Chat'
import {
  MarkDeliveredInternalEvent,
  MarkReadInternalEvent,
  MessageId,
  Timestamp,
  UpdateChatInternalEvent,
  UserId,
} from '~/types/ws/internal'
import { splitArray } from '~/utils/split-array'
import { DEFAULT_PORTION, MAX_PORTION } from './constants'
import { userStorage } from './utils/mdo'
import { Mark, Marks } from '../../types/Marks'

export class DialogsDO extends DurableObject implements TM_DurableObject {
  #timestamp = Date.now()
  #messages: DialogMessage[] = []
  #users?: [Profile, Profile]
  #id: string = ''
  #counter = 0
  #lastRead = new Map<string, number>()
  #readMarks: Marks = {}
  #dlvrdMarks: Marks = {}
  #storage!: DurableObjectStorage
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

  async create(owner: string, secondUser: string): Promise<Dialog> {
    if (this.#users?.length) return this.chat(owner)
    // if (this.#messages.length) throw new Error('DO dialog: "messages" is not empty')
    const [user1Id, user2Id] = [owner, secondUser].sort((a, b) => (a > b ? 1 : -1))
    this.#id = `${user1Id}:${user2Id}`

    const user1 = (
      await getUserById(this.env.DB, user1Id, new NotFoundError(`user ${user2Id} is not exists`))
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

  chat(userId: string): Dialog {
    if (!this.#users) {
      console.error("DO dialog: 'users' is not initialized")
      throw new Error("DO dialog: 'users' is not initialized")
    }
    const user2 = this.#users[0].id === userId ? this.#users[1] : this.#users[0]

    const lastMessage = this.#messages[this.#counter - 1]
    const chat: Dialog = {
      chatId: user2.id,
      lastMessageId: this.#messages.length - 1,
      photoUrl: user2.avatarUrl,
      type: 'dialog',
      meta: {
        firstName: user2.firstName,
        lastName: user2.lastName,
        phoneNumber: user2.phoneNumber,
        username: user2.username,
      },
      missed: this.#counter - (this.#lastRead.get(userId) || 0) - 1,
      lastMessageText: lastMessage?.message,
      lastMessageTime: lastMessage?.createdAt,
      lastMessageAuthor: lastMessage?.sender,
      lastMessageStatus: lastMessage?.read ? 'read' : lastMessage?.dlvrd ? 'unread' : 'undelivered',
      isMine: userId === lastMessage?.sender,
      name: '',
    }
    chat.name = displayName(chat.meta)

    return chat
  }

  async counter() {
    return this.#counter
  }

  async newId() {
    await this.#storage.put('counter', ++this.#counter)
    return this.#counter - 1
  }

  async getMessages(payload: GetMessagesRequest): Promise<GetMessagesResponse> {
    if (!this.#messages) return { messages: [], authors: [] }
    if (!payload.startId) {
      const endIndex = payload.endId || this.#messages.length
      const portion = payload.count ? Math.min(MAX_PORTION, payload.count) : DEFAULT_PORTION
      const startIndex = endIndex > portion ? endIndex - portion : 0
      const messages = await this.loadMessages(startIndex, endIndex)
      return { messages, authors: [] }
    } else {
      const portion = payload.count ? Math.min(MAX_PORTION, payload.count) : DEFAULT_PORTION
      const startIndex = payload.startId
      const endIndex = startIndex + portion
      const messages = await this.loadMessages(startIndex, endIndex)
      return { messages, authors: [] }
    }
  }
  async loadMessages(startId: number, endId: number) {
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
          this.#messages[i] = message
        }
      }
    }
    return this.#messages.slice(startId, endId).filter(m => !!m)
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
    console.log(messageId)
    const message: DialogMessage = {
      createdAt: timestamp,
      messageId,
      sender: sender,
      message: request.message,
      attachments: request.attachments,
      clientMessageId: request.clientMessageId,
    }
    this.#messages[messageId] = message
    this.#lastMessage = message
    await this.sendNewEventToReceiver(request.chatId, message, timestamp)

    await this.#storage.put<DialogMessage>(`message-${messageId}`, message)

    if (messageId > 0) {
      if ((await this.#message(messageId - 1))!.sender !== sender) {
        await this.read(sender, { chatId: request.chatId, messageId: messageId - 1 }, timestamp)
      }
    }

    this.#lastRead.set(sender, messageId)

    return { messageId, timestamp, clientMessageId: message.clientMessageId }
  }

  async dlvrd(
    sender: string,
    request: MarkDeliveredRequest,
    timestamp: number,
  ): Promise<MarkDlvrdResponse> {
    let endIndex = this.#messages.length - 1

    if (request.messageId) {
      endIndex = this.#messages.findLastIndex(m => m.messageId === request.messageId)

      if (endIndex === -1) {
        throw new Error(`messageId is not exists`)
      }
    }
    const messageId = this.#messages[endIndex].messageId
    if (this.#messages[endIndex].dlvrd) {
      return { messageId, timestamp: this.#messages[endIndex].dlvrd! }
    }

    for (let i = endIndex; i >= 0; i--) {
      const message = this.#messages[i] as DialogMessage
      if (message.sender === sender) {
        continue
      }
      if (message.dlvrd) {
        break
      }
      this.#messages[i].dlvrd = timestamp
      await this.#storage.put<DialogMessage>(`message-${message.messageId}`, message, {
        allowConcurrency: false,
      })
    }

    await this.sendDlvrdEventToAuthor(request.chatId, this.#messages[messageId], timestamp)
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
    let readIndex = this.#readMarks[sender].findIndex(e => e[0] >= messageId)
    const read = readIndex ? this.#readMarks[sender][readIndex][1] : 0

    const result = {
      chatId: request.chatId,
      messageId,
      timestamp: read || timestamp,
      missed: this.#counter - (this.#lastRead.get(sender) || 0) - 1,
    }
    const lastRead = this.#lastRead.get(sender)
    if (lastRead && lastRead >= messageId) {
      return result
    }

    if (message?.sender === sender) {
      return result
    }

    this.#lastRead.set(sender, messageId)
    const mark: Mark = [messageId, timestamp]
    this.#readMarks[sender].push(mark)
    await this.#storage.put<Mark>(`read-${sender}-${this.#readMarks[sender].length - 1}`, mark)

    await this.sendReadEventToAuthor(request.chatId, message, timestamp)

    return {
      chatId: request.chatId,
      messageId,
      timestamp,
      missed: this.#counter - (this.#lastRead.get(sender) || 0) - 1,
    }
  }

  private async sendDlvrdEventToAuthor(
    receiverId: string,
    message: DialogMessage,
    timestamp: number,
  ) {
    // Retrieve sender and receiver's durable object IDs

    const receiverDO = userStorage(this.env, receiverId)

    // Create an event object with message details and timestamp
    const event: MarkDeliveredInternalEvent = {
      chatId: this.chat(receiverId).chatId,
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

  private async sendReadEventToAuthor(
    receiverId: string,
    message: DialogMessage,
    timestamp: number,
  ) {
    const receiverDO = userStorage(this.env, receiverId)
    const senderId = this.#id.replace(receiverId, '').replace(':', '')
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
    const senderId = this.#id.replace(receiverId, '').replace(':', '')

    const event: NewMessageEvent = {
      messageId: message.messageId,
      sender: senderId,
      chatId: senderId,
      message: message.message,
      attachments: message.attachments,
      clientMessageId: message.clientMessageId,
      timestamp,
      missed: this.#counter - (this.#lastRead.get(receiverId) || 0) - 1,
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
        this.#messages[message.messageId] = {
          ...this.#messages[message.messageId],
          dlvrd: timestamp,
        }
        this.ctx.waitUntil(
          this.#storage.put<DialogMessage>(`message-${message.messageId}`, message, {
            allowConcurrency: true,
          }),
        )
      }
    }
  }

  private async initialize() {
    if (!this.#users || !this.#users.length) {
      this.#users = await this.#storage.get('users')
    }
    this.#counter = (await this.#storage.get<number>('counter')) || 0
    if (this.#users) {
      this.#id = `${this.#users[0].id}:${this.#users[1].id}`

      const readMarkKeys: string[] = []
      for (const user of this.#users) {
        let i = 0
        while (true) {
          const key = `read-${user.id}-${i}`
          readMarkKeys.push(key)
          i++
        }
      }

      const readMarkChunks = splitArray(readMarkKeys, 128)
      for (const chunk of readMarkChunks) {
        const marksChunk = await this.#storage.get<Mark>(chunk)
        for (const key of marksChunk.keys()) {
          const [_, userId, index] = key.split('-')
          if (!this.#readMarks[userId]) {
            this.#readMarks[userId] = []
          }
          this.#readMarks[userId][parseInt(index)] = marksChunk.get(key)!
        }
      }
      this.#dlvrdMarks = (await this.#storage.get<Marks>('dlvrd-marks')) || {}
    }
    this.#messages = []
    if (this.#counter) {
      const lastMessage = await this.#storage.get<DialogMessage>(`message-${this.#counter - 1}`)
      if (lastMessage) {
        this.#lastMessage = lastMessage
        this.#messages[this.#counter - 1] = lastMessage
      }
    }

    if (this.#messages.length) {
      const lastMessage = this.#messages.slice(-1)[0]
      this.#lastRead.set(lastMessage!.sender, lastMessage!.messageId)
      const receiver = this.#id.replace(lastMessage!.sender, '').replace(':', '')
      this.#lastRead.set(
        receiver,
        this.#messages.findLastIndex(
          message =>
            (message.read && message.sender === lastMessage.sender) || message.sender === receiver,
        ),
      )
    }
  }

  private timestamp() {
    const current = performance.now()
    return (this.#timestamp = current > this.#timestamp ? current : ++this.#timestamp)
  }
  async processTask(task: Task): Promise<void> {}

  async fetch(request: Request<unknown, CfProperties<unknown>>): Promise<Response> {
    return new Response()
  }

  async updateProfile(profile: Profile) {
    if (!this.#users) return
    const index = this.#users.findIndex(user => user.id === profile.id)
    if (index && index >= 0) {
      this.#users[index] = profile
    }
    const index2 = (index - 1) * -1
    const receiverId = this.#users[index2].id
    const receiverDO = userStorage(this.env, receiverId)
    const event: UpdateChatInternalEvent = this.chat(receiverId)

    const reqBody = JSON.stringify(event)

    const resp = await receiverDO.fetch(
      new Request(`${this.env.ORIGIN}/${receiverId}/dialog/event/updateChat`, {
        method: 'POST',
        body: reqBody,
      }),
    )
  }
}
