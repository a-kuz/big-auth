import { DialogMessage } from '~/types/ChatMessage'
import { NewMessageResponse } from '~/types/ws'
import {
  GetMessagesRequest,
  MarkDeliveredRequest,
  MarkReadRequest,
  NewMessageRequest,
} from '~/types/ws/client-requests'
import { MarkDeliveredEvent, MarkReadEvent, NewMessageEvent } from '~/types/ws/server-events'
import { ChatList } from '../../types/ChatList'
import { Env } from '../../types/Env'

import { DurableObject } from 'cloudflare:workers'
import { User } from '~/db/models/User'
import { getUserById } from '~/db/services/get-user'
import { NotFoundError } from '~/errors/UnauthorizedError'
import { Dialog } from '~/types/Chat'
import { MarkDeliveredInternalEvent, MarkReadInternalEvent } from '~/types/ws/internal'
import { errorResponse } from '~/utils/error-response'
const DEFAULT_PORTION = 50
const MAX_PORTION = 500
export class DialogDO extends DurableObject {
  #timestamp = Date.now()
  #messages: DialogMessage[] = []
  #users?: [User, User]
  #id: string = ''
  #counter = 0

  constructor(
    readonly ctx: DurableObjectState,
    readonly env: Env,
  ) {
    super(ctx, env)
    console.log({ 'this.ctx.id.name': this.ctx.id.name })
    this.ctx.blockConcurrencyWhile(async () => this.initialize())
    ctx.storage.setAlarm(Date.now() + 1000 * 60 * 5)
  }

  async alarm(): Promise<void> {
    if (!this.#users?.length) {
      return
    }
    const user1 = await getUserById(this.env.DB, this.#users[0].id)

    const user2 = await getUserById(this.env.DB, this.#users[1].id)

    this.#users = [user1, user2]
    await this.ctx.storage.put('users', this.#users)
    this.ctx.storage.setAlarm(Date.now() + 1000 * 60 * 5)
  }

  async create(owner: string, secondUser: string) {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (this.#users?.length) return
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
      await this.ctx.blockConcurrencyWhile(async () => this.initialize())
      return this.chat(owner)
    })
  }

  chat(userId: string) {
    if (!this.#users) {
      console.log(this.env)
      throw new Error(`DO dialog ${this.ctx.id}: "users" is not initialized`)
    }
    const user2 = this.#users[0].id === userId ? this.#users[1] : this.#users[0]

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
    }
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
  async getMessages(payload: GetMessagesRequest): Promise<DialogMessage[]> {
    if (!this.#messages) return []
    const endIndex = payload.endId || this.#messages.length - 1
    const portion = payload.count ? Math.min(MAX_PORTION, payload.count) : DEFAULT_PORTION
    const startIndex = endIndex > portion ? endIndex - portion + 1 : 0
    const messages = this.#messages.slice(startIndex, endIndex + 1).filter(m => !!m)
    return messages
  }

  async newHandler(
    sender: string,
    request: NewMessageRequest,
    timestamp: number,
  ): Promise<NewMessageResponse> {
    return this.newMessage(sender, request, timestamp)
  }

  async newMessage(
    sender: string,
    request: NewMessageRequest,
    timestamp: number,
  ): Promise<NewMessageResponse> {
    const messageId = await this.newId()
    console.log(messageId)
    const message: DialogMessage = {
      createdAt: timestamp,
      messageId,
      sender: sender,
      message: request.message,
      attachments: request.attachments,
    }
    this.#messages.push(message)

    await this.sendNewEventToReceiver(request.chatId, message, timestamp)

    await this.ctx.blockConcurrencyWhile(async () => {
      await this.ctx.storage.put<DialogMessage>(`message-${messageId}`, message)
      await this.ctx.storage.put<number>('counter', this.#messages.length)
    })

    return { messageId, timestamp }
  }

  async dlvrd(sender: string, request: MarkDeliveredRequest, timestamp: number) {
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

		await this.sendDlvrdEventToAuthor(request.chatId, messageId, timestamp)
    return { messageId, timestamp }
  }

  async read(sender: string, request: MarkReadRequest, timestamp: number) {
    if (!this.#messages.length) {
      console.error('read requ for emty chat')
      throw new Error('Chat is empty')
    }
    let endIndex = this.#messages.length - 1

    if (request.messageId) {
      endIndex = this.#messages.findLastIndex(m => m.messageId === request.messageId)

      if (endIndex === -1) {
        throw new Error(`messageId is not exists`)
      }
    }
    const messageId = this.#messages[endIndex].messageId

    for (let i = endIndex; i >= 0; i--) {
      const message = this.#messages[i]
      if (message.sender === sender) {
        continue
      }
      if (message.read) {
        break
      }

      this.#messages[i].read = timestamp

      if (!this.#messages[i].dlvrd) this.#messages[i].dlvrd = timestamp
      await this.ctx.storage.put<DialogMessage>(`message-${message.messageId}`, message, {
        allowConcurrency: false,
      })
    }
    await this.sendReadEventToAuthor(request.chatId, messageId, timestamp)

    return { messageId, isLast: messageId === this.#messages.length - 1 }
  }

  private async sendDlvrdEventToAuthor(receiverId: string, messageId: number, timestamp: number) {
    // Retrieve sender and receiver's durable object IDs

    const receiverDOId = this.env.USER_MESSAGING_DO.idFromName(receiverId)
    const receiverDO = this.env.USER_MESSAGING_DO.get(receiverDOId)

    // Create an event object with message details and timestamp
    const event: MarkDeliveredInternalEvent = {
      chatId: this.chat(receiverId).chatId,
      messageId,
      timestamp,
    }

    const reqBody = JSON.stringify(event)
    const headers = new Headers({ 'Content-Type': 'application/json' })

    const resp = await receiverDO.fetch(
      new Request(`${this.env.ORIGIN}/${receiverId}/internal/event/dlvrd`, {
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

  private async sendReadEventToAuthor(receiverId: string, messageId: number, timestamp: number) {
    // Retrieve sender and receiver's durable object IDs

    const receiverDOId = this.env.USER_MESSAGING_DO.idFromName(receiverId)
    const receiverDO = this.env.USER_MESSAGING_DO.get(receiverDOId)
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
      new Request(`${this.env.ORIGIN}/${receiverId}/internal/event/read`, {
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
    const receiverDOId = this.env.USER_MESSAGING_DO.idFromName(receiverId)
    const receiverDO = this.env.USER_MESSAGING_DO.get(receiverDOId)
    const senderId = this.#id.replace(receiverId, '').replace(':', '')

    const event: NewMessageEvent = {
      messageId: message.messageId,
      sender: senderId,
      chatId: senderId,
      message: message.message,
      attachments: message.attachments,
      timestamp,
      type: 'dialog',
    }

    const reqBody = JSON.stringify(event)
    const headers = new Headers({ 'Content-Type': 'application/json' })

    const resp = await receiverDO.fetch(
      new Request(`${this.env.ORIGIN}/${receiverId}/internal/event/new`, {
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
    this.#users = await this.ctx.storage.get('users')
    if (this.#users) {
      this.#id = `${this.#users[0].id}:${this.#users[1].id}`
    }
    this.#counter = (await this.ctx.storage.get<number>('counter')) || 0

    this.#messages = []
    for (let i = 0; i < this.#counter; i++) {
      this.#messages.push((await this.ctx.storage.get<DialogMessage>(`message-${i}`))!)
    }
  }
}
