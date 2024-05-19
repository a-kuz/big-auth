import { DialogMessage } from '~/types/ChatMessage'
import { MarkDlvrdResponse, MarkReadResponse, NewMessageResponse } from '~/types/ws/responses'
import {
  GetMessagesRequest,
  GetMessagesResponse,
  MarkDeliveredRequest,
  MarkReadRequest,
  NewMessageRequest,
} from '~/types/ws/client-requests'
import { NewMessageEvent } from '~/types/ws/server-events'
import { Env } from '../../types/Env'

import { DurableObject } from 'cloudflare:workers'
import { User } from '~/db/models/User'
import { getUserById } from '~/db/services/get-user'
import { NotFoundError } from '~/errors/NotFoundError'
import { displayName } from '~/services/display-name'
import { Dialog } from '~/types/Chat'
import { MarkDeliveredInternalEvent, MarkReadInternalEvent } from '~/types/ws/internal'
import { DEFAULT_PORTION, MAX_PORTION } from './constants'
import { userStorage } from './utils/mdo'
import { serializeError } from 'serialize-error'

export class DialogsDO extends DurableObject {
  #timestamp = Date.now()
  #messages: DialogMessage[] = []
  #users?: [User, User]
  #id: string = ''
  #counter = 0
  #lastRead = new Map<string, number>()

  constructor(
    readonly ctx: DurableObjectState,
    readonly env: Env,
  ) {
    super(ctx, env)
    this.ctx.setHibernatableWebSocketEventTimeout(1000 * 60 * 60 * 24)
    this.ctx.blockConcurrencyWhile(() => this.initialize())
    ctx.storage.setAlarm(Date.now() + 1000 * 60 * 5)
  }

  async alarm(): Promise<void> {
    console.log('Dialog ALARM')
    try {
      if (!this.#users?.length) {
        return
      }
      try {
        this.#users[0] = await getUserById(this.env.DB, this.#users[0].id)
      } catch (e) {
        console.error(serializeError(e))
      }

      try {
        this.#users[1] = await getUserById(this.env.DB, this.#users[1].id)
      } catch (e) {
        console.error(serializeError(e))
      }

      await this.ctx.storage.put('users', this.#users, {
        allowConcurrency: true,
        allowUnconfirmed: true,
      }),
        await this.ctx.storage.setAlarm(Date.now() + 1000 * 10 * 60, {
          allowConcurrency: true,
          allowUnconfirmed: true,
        })
    } catch (e) {
      console.error(serializeError(e))
    }
  }

  async create(owner: string, secondUser: string): Promise<Dialog> {
    if (this.#users?.length) return this.chat(owner)
    // if (this.#messages.length) throw new Error('DO dialog: "messages" is not empty')
    const [user1Id, user2Id] = [owner, secondUser].sort((a, b) => (a > b ? 1 : -1))
    this.#id = `${user1Id}:${user2Id}`

    const user1 = await getUserById(
      this.env.DB,
      user1Id,
      new NotFoundError(`user ${user2Id} is not exists`),
    )

    const user2 = await getUserById(
      this.env.DB,
      user2Id,
      new NotFoundError(`user ${user2Id} is not exists`),
    )

    this.#users = [user1, user2]

    await this.ctx.storage.put('users', this.#users)
    await this.ctx.storage.put('messages', [])
    await this.ctx.storage.put('counter', 0)
    await this.ctx.storage.put('createdAt', Date.now())

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

  counter() {
    return this.#messages.length
  }

  async newId() {
    this.#counter++
    await this.ctx.storage.put('counter', this.#counter - 1)
    return this.#counter - 1
  }
  async getMessages(payload: GetMessagesRequest): Promise<GetMessagesResponse> {
    if (!this.#messages) return { messages: [], authors: [] }
    const endIndex = payload.endId || this.#messages.length - 1
    const portion = payload.count ? Math.min(MAX_PORTION, payload.count) : DEFAULT_PORTION
    const startIndex = endIndex > portion ? endIndex - portion + 1 : 0
    const messages = this.#messages.slice(startIndex, endIndex + 1).filter(m => !!m)
    return { messages, authors: [] }
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

    await this.sendNewEventToReceiver(request.chatId, message, timestamp)

    await this.ctx.storage.put<DialogMessage>(`message-${messageId}`, message)
    await this.ctx.storage.put<number>('counter', this.#messages.length)
    if (messageId > 0) {
      if (this.#messages[messageId - 1].sender !== sender) {
        await this.read(sender, { chatId: request.chatId, messageId: messageId - 1 }, timestamp)
      }
    }
    const lastRead = this.#lastRead.get(sender)
    if (!lastRead || lastRead < messageId) {
      this.#lastRead.set(sender, messageId)
    }
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

    for (let i = endIndex; i >= 0; i--) {
      const message = this.#messages[i] as DialogMessage
      if (message.sender === sender) {
        continue
      }
      if (message.dlvrd) {
        break
      }
      this.#messages[i].dlvrd = timestamp
      await this.ctx.storage.put<DialogMessage>(`message-${message.messageId}`, message, {
        allowConcurrency: false,
      })
    }

    await this.sendDlvrdEventToAuthor(request.chatId, this.#messages[messageId], timestamp)
    return { messageId, timestamp }
  }

  async read(
    sender: string,
    request: MarkReadRequest,
    timestamp: number,
  ): Promise<MarkReadResponse> {
    if (!this.#messages.length) {
      console.error('read requ for emty chat')
      throw new Error('Chat is empty')
    }
    let endIndex = this.#messages.length - 1

    if (request.messageId) {
      endIndex = this.#messages.findLastIndex(m => m.messageId <= request.messageId!)

      if (endIndex === -1) {
        throw new Error(`messageId is not exists`)
      }
    }
    const message = this.#messages[endIndex]
    if (message.read) {
      return {
        messageId: message.messageId,
        timestamp: message.read,
        missed: this.#counter - (this.#lastRead.get(sender) || 0) - 1,
      }
    }
    const messageId = this.#messages[endIndex].messageId

    const lastRead = this.#lastRead.get(sender)
    if (!lastRead || lastRead < messageId) {
      this.#lastRead.set(sender, messageId)
    }
    let lastUnread = 0
    for (let i = endIndex; i >= 0; i--) {
      const message = this.#messages[i]
      if (message.sender === sender) {
        continue
      } else if (message.read) {
        break
      }

      this.#messages[i].read = timestamp

      if (!this.#messages[i].dlvrd) this.#messages[i].dlvrd = timestamp
      await this.ctx.storage.put<DialogMessage>(`message-${message.messageId}`, message, {
        allowConcurrency: false,
      })
    }
    await this.sendReadEventToAuthor(request.chatId, this.#messages[messageId], timestamp)

    return { messageId, timestamp, missed: this.#counter - (this.#lastRead.get(sender) || 0) - 1 }
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

    const reqBody = JSON.stringify(event)
    const headers = new Headers({ 'Content-Type': 'application/json' })

    const resp = await receiverDO.fetch(
      new Request(`${this.env.ORIGIN}/${receiverId}/dialog/event/dlvrd`, {
        method: 'POST',
        body: reqBody,
        headers,
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
    // Retrieve sender and receiver's durable object IDs

    const receiverDO = userStorage(this.env, receiverId)
    const senderId = this.#id.replace(receiverId, '').replace(':', '')
    // Create an event object with message details and timestamp
    const event: MarkReadInternalEvent = {
      chatId: senderId,
      messageId: message.messageId,
      clientMessageId: message.clientMessageId,
      timestamp,
    }

    const reqBody = JSON.stringify(event)
    const headers = new Headers({ 'Content-Type': 'application/json' })

    const resp = await receiverDO.fetch(
      new Request(`${this.env.ORIGIN}/${receiverId}/dialog/event/read`, {
        method: 'POST',
        body: reqBody,
        headers,
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
      missed: this.#counter - (this.#lastRead.get(senderId) || 0) - 1,
    }

    const reqBody = JSON.stringify(event)
    const headers = new Headers({ 'Content-Type': 'application/json' })

    const resp = await receiverDO.fetch(
      new Request(`${this.env.ORIGIN}/${receiverId}/dialog/event/new`, {
        method: 'POST',
        body: reqBody,
        headers,
      }),
    )
    if (resp.status !== 200) {
      console.error(await resp.text())
      console.error("couldn't send event")
      throw new Error("Couldn't send event")
    }
  }

  private async initialize() {
    if (!this.#users || !this.#users.length) {
      this.#users = await this.ctx.storage.get('users')
    }
    if (this.#users) {
      this.#id = `${this.#users[0].id}:${this.#users[1].id}`
    }
    this.#counter = (await this.ctx.storage.get<number>('counter')) || 0

    this.#messages = []
    for (let i = 0; i < this.#counter; i++) {
      const m = await this.ctx.storage.get<DialogMessage>(`message-${i}`)
      if (m) {
        this.#messages.push(m)
        if (m.read) {
          this.#lastRead.set(this.#id.replace(m.sender, '').replace(':', ''), m.messageId)
        }
      }
    }
  }

  private timestamp() {
    const current = performance.now()
    return (this.#timestamp = current > this.#timestamp ? current : ++this.#timestamp)
  }
}
