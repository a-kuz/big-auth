import { ChatMessage, DialogMessage } from '~/types/ChatMessage'
import {
  GetMessagesRequest,
  GetMessagesResponse,
  MarkDeliveredRequest,
  MarkReadRequest,
  NewMessageRequest,
} from '~/types/ws/client-requests'
import { MarkDlvrdResponse, MarkReadResponse, NewMessageResponse } from '~/types/ws/responses'
import { Env } from '../../types/Env'

import { DurableObject } from 'cloudflare:workers'
import { User } from '~/db/models/User'
import { getUserById } from '~/db/services/get-user'
import { NotFoundError } from '~/errors/NotFoundError'
import { MarkReadInternalEvent } from '~/types/ws/internal'
import { DEFAULT_PORTION, MAX_PORTION } from './constants'
import { userStorage } from './utils/mdo'
import { Chat, Dialog, DialogAI } from '~/types/Chat'
import { GPTmessage, askGPT } from '~/services/ask-gpt'
import { newId } from '~/utils/new-id'
import { NewMessageEvent } from '~/types/ws/server-events'
import { ChatListItem } from '~/types/ChatList'
import { serializeError } from 'serialize-error'

export class ChatGptDO extends DurableObject {
  #timestamp = Date.now()
  #messages: DialogMessage[] = []
  #user?: User
  #id: string = ''
  #counter = 0
  #lastRead = new Map<string, number>()

  constructor(
    readonly ctx: DurableObjectState,
    readonly env: Env,
  ) {
    super(ctx, env)
    console.log({ 'this.ctx.id.name': this.ctx.id.name })
    this.ctx.blockConcurrencyWhile(async () => this.initialize())
  }

  async alarm(): Promise<void> {
    console.log('GPT ALARM')

    try {
      if (this.#messages.slice(-1)[0].sender === this.#id) {
        const GPTmessages = this.#messages.slice(-20).map<GPTmessage>(e => ({
          content: e.message!,
          role: e.sender === this.#id ? 'user' : 'assistant',
        }))
        const answer = await askGPT(GPTmessages, this.env)
        if (!answer) {
          return
        }
        const message: ChatMessage = {
          clientMessageId: newId(),
          createdAt: this.timestamp(),
          messageId: await this.newId(),
          sender: 'ai',
          message: answer,
        }

        const event: NewMessageEvent = {
          messageId: message.messageId,
          sender: 'ai',
          chatId: 'AI',
          message: message.message,
          clientMessageId: message.clientMessageId,
          timestamp: message.createdAt,
          missed: 1,
        }
        this.#messages.push(message)
        await this.ctx.storage.put<DialogMessage>(`message-${message.messageId}`, message)
        await this.ctx.storage.put<number>('counter', this.#messages.length)
        await this.sendNewEventToReceiver(this.#id, message, message.createdAt)
      }
    } catch (e) {
      console.error(serializeError(e))
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
      sender: 'ai',
      chatId: 'AI',
      message: message.message,
      attachments: message.attachments,
      clientMessageId: message.clientMessageId,
      timestamp,
      missed: 1,
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
      throw new Error("Couldn't send event")
    }
  }
  async create(owner: string) {
    return this.ctx.blockConcurrencyWhile(async () => {
      // if (this.#messages.length) throw new Error('DO dialog: "messages" is not empty')

      this.#id = owner

      this.#user = await getUserById(
        this.env.DB,
        owner,
        new NotFoundError(`user ${owner} is not exists`),
      )
      const message: ChatMessage = {
        clientMessageId: newId(),
        createdAt: this.timestamp(),
        messageId: 0,
        sender: 'ai',
        message: 'ask me',
      }

      this.#messages.push(message)
      await this.ctx.storage.put<DialogMessage>(`message-${message.messageId}`, message)
      await this.ctx.storage.put<number>('counter', this.#messages.length)
      await this.ctx.blockConcurrencyWhile(async () => {
        await this.ctx.storage.put('user', this.#user)
        await this.ctx.storage.put('createdAt', Date.now())
        await this.initialize()
      })

      return this.chat()
    })
  }

  chat(userId?: string): DialogAI {
    if (!this.#user) {
    }
    if (userId) {
      this.#id = userId
    }

    const lastMessage = this.#messages[this.#counter - 1]
    const chat: ChatListItem | DialogAI = {
      chatId: 'AI',
      id: 'AI',
      verified: true,
      lastMessageId: this.#messages.length ? this.#messages.length - 1 : 0,
      photoUrl: this.env.AI_AVATAR_URL,
      type: 'ai',
      missed: this.#counter - (this.#lastRead.get(this.#id) || 0) - 1,
      lastMessageText: lastMessage?.message ?? '',
      lastMessageTime: lastMessage?.createdAt,
      lastMessageAuthor: lastMessage?.sender,
      lastMessageStatus: lastMessage?.read ? 'read' : lastMessage?.dlvrd ? 'unread' : 'undelivered',
      isMine: userId === lastMessage?.sender,
      name: 'ask AI',
    }

    return chat as DialogAI
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
    if (!this.#messages) return []
    const endIndex = payload.endId || this.#messages.length - 1
    const portion = payload.count ? Math.min(MAX_PORTION, payload.count) : DEFAULT_PORTION
    const startIndex = endIndex > portion ? endIndex - portion + 1 : 0
    const messages = this.#messages.slice(startIndex, endIndex + 1).filter(m => !!m)
    return { messages, authors: [] }
  }

  async newMessage(sender: string, request: NewMessageRequest): Promise<NewMessageResponse> {
    await this.ctx.storage.deleteAlarm()
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

    await this.ctx.storage.setAlarm(new Date(Date.now() + 500))
    return { messageId, timestamp, clientMessageId: message.clientMessageId }
  }

  async dlvrd(
    sender: string,
    request: MarkReadRequest,
    timestamp: number,
  ): Promise<MarkDlvrdResponse> {
    return { ...request, timestamp: this.#timestamp }
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
      endIndex = this.#messages.findLastIndex(m => m.messageId <= request.messageId)

      if (endIndex === -1) {
        throw new Error(`messageId is not exists`)
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
    await this.sendReadEventToAuthor(request.chatId, messageId, timestamp)

    return { messageId, timestamp, missed: 0 }
  }

  private async sendReadEventToAuthor(receiverId: string, messageId: number, timestamp: number) {
    // Retrieve sender and receiver's durable object IDs
    if (receiverId === 'ai') return
    const receiverDO = userStorage(this.env, receiverId)
    const senderId = this.#id.replace(receiverId, '').replace(':', '')
    // Create an event object with message details and timestamp
    const event: MarkReadInternalEvent = {
      chatId: senderId,
      messageId,
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

  private async initialize() {
    this.#user = await this.ctx.storage.get('user')
    if (!this.#user) {
      return
    }

    this.#id = this.#user.id

    this.#counter = (await this.ctx.storage.get<number>('counter')) || 0

    this.#messages = []
    for (let i = 0; i < this.#counter; i++) {
      const m = await this.ctx.storage.get<DialogMessage>(`message-${i}`)
      if (m) {
        this.#messages.push(m)
        if (m.read) {
          this.#lastRead.set(this.#id, m.messageId)
        }
      }
    }
  }

  private timestamp() {
    const current = performance.now()
    return (this.#timestamp = current > this.#timestamp ? current : ++this.#timestamp)
  }
}
