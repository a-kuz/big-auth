import { ChatMessage, StoredDialogMessage } from '~/types/ChatMessage'
import {
  CallNewMessageRequest,
  DeleteRequest,
  GetMessagesRequest,
  GetMessagesResponse,
  MarkDeliveredRequest,
  MarkReadRequest,
  NewMessageRequest,
} from '~/types/ws/client-requests'
import {
  DeleteResponse,
  MarkDlvrdResponse,
  MarkReadResponse,
  NewMessageResponse,
} from '~/types/ws/responses'
import { Env } from '../../types/Env'

import { User } from '~/db/models/User'
import { getUserById } from '~/db/services/get-user'
import { NotFoundError } from '~/errors/NotFoundError'
import { GPTmessage, askGPT } from '~/services/ask-gpt'
import { DialogAI } from '~/types/Chat'
import { ChatListItem } from '~/types/ChatList'
import { MarkReadInternalEvent, UserId } from '~/types/ws/internal'
import { DeleteEvent, NewMessageEvent } from '~/types/ws/server-events'
import { newId } from '~/utils/new-id'
import { DEFAULT_PORTION, MAX_PORTION } from './constants'
import { userStorage } from './utils/mdo'

import { writeErrorLog } from '~/utils/serialize-error'
import { splitArray } from '~/utils/split-array'
import { DebugableDurableObject } from '../DebugWrapper'

export class ChatGptDO extends DebugableDurableObject {
  #timestamp = Date.now()
  #messages: StoredDialogMessage[] = []
  #user?: User
  #id: string = ''
  #counter = 0
  #lastRead = new Map<string, number>()

  constructor(
    readonly ctx: DurableObjectState,
    readonly env: Env,
  ) {
    super(ctx, env)

    this.ctx.blockConcurrencyWhile(async () => this.initialize())
  }

  lastMessage() {}
  async alarm(): Promise<void> {
    console.log('GPT ALARM')
    try {
      if (this.#messages.slice(-1)[0].sender === this.#id) {
        await this.read(
          'ai',
          { chatId: this.#id, messageId: this.#messages.slice(-1)[0].messageId },
          Date.now(),
        )
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
          firstMissed: message.clientMessageId,
        }
        this.#messages.push(message)
        await this.ctx.storage.put<StoredDialogMessage>(`message-${message.messageId}`, message)
        console.log('this.#id', this.#id)
        await this.sendNewEventToReceiver(this.#user?.id!, message, message.createdAt)
      }
    } catch (e) {
      await writeErrorLog(e)
    }
  }

  private async sendNewEventToReceiver(
    receiverId: string,
    message: StoredDialogMessage,
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
      firstMissed: message.clientMessageId,
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
        new NotFoundError(`user ${owner} is not exists (from ai)`),
      )
      const message: ChatMessage = {
        clientMessageId: newId(),
        createdAt: this.timestamp(),
        messageId: 0,
        sender: 'ai',
        message: 'ask me',
      }

      this.#messages.push(message)
      await this.ctx.storage.put<StoredDialogMessage>(`message-${message.messageId}`, message)
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
      if (userId) {
        this.#id = userId
      }
    } else {
      this.#id = this.#user.id
    }
    const lastMessage = this.#messages.slice(-1)[0]
    const missed = this.#counter > 1 ? this.#counter - (this.#lastRead.get(this.#id) || 0) - 1 : 0
    const chat: ChatListItem | DialogAI = {
      chatId: 'AI',
      id: 'AI',
      verified: true,
      lastMessageId: this.#messages.length ? this.#messages.length - 1 : 0,
      photoUrl: this.env.AI_AVATAR_URL,
      type: 'ai',
      missed,
      firstMissed: missed ? lastMessage.clientMessageId : undefined,
      lastMessageText: lastMessage?.message ?? '',
      lastMessageTime: lastMessage?.createdAt,
      lastMessageAuthor: lastMessage?.sender,
      lastMessageStatus: lastMessage?.read ? 'read' : lastMessage?.dlvrd ? 'unread' : 'undelivered',
      isMine: userId === lastMessage?.sender,
      name: 'ask AI',
      meta: { firstName: 'AI' },
    }

    return chat as DialogAI
  }

  counter() {
    return this.#messages.length
  }
  async deleteMessage(sender: UserId, request: DeleteRequest): Promise<DeleteResponse> {
    const { originalMessageId, chatId } = request
    const message = this.#messages[originalMessageId]
    if (!message) {
      throw new Error(`Message with ID ${originalMessageId} does not exist`)
    }
    message.deletedAt = this.timestamp()
    message.message = undefined
    message.attachments = undefined
    await this.ctx.storage.put(`message-${originalMessageId}`, message)

    const messageId = await this.newId()
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
    await this.ctx.storage.put(`message-${serviceMessage.messageId}`, serviceMessage)

    const deleteMessageEvent: DeleteEvent = {
      originalMessageId,
      chatId,
      messageId,
    }

    return { messageId, timestamp: message.deletedAt }
  }
  async newId() {
    this.#counter++
    await this.ctx.storage.put('counter', this.#counter)
    return this.#counter - 1
  }
  async getMessages(payload: GetMessagesRequest, userId: string): Promise<GetMessagesResponse> {
    if (!this.#messages) return { messages: [], authors: [] }
    if (!payload.startId) {
      const endIndex = payload.endId || this.#messages.length - 1
      const portion = payload.count ? Math.min(MAX_PORTION, payload.count) : DEFAULT_PORTION
      const startIndex = endIndex > portion ? endIndex - portion + 1 : 0
      const messages = this.#messages.slice(startIndex, endIndex + 1).filter(m => !!m)
      return { messages, authors: [] }
    } else {
      const portion = payload.count ? Math.min(MAX_PORTION, payload.count) : DEFAULT_PORTION
      const startIndex = payload.startId
      const endIndex = startIndex + portion - 1
      const messages = this.#messages.slice(startIndex, endIndex + 1).filter(m => !!m)
      return { messages, authors: [] }
    }
  }
  async newMessage(sender: string, request: NewMessageRequest): Promise<NewMessageResponse> {
    await this.ctx.storage.deleteAlarm()
    const timestamp = this.timestamp()
    const messageId = await this.newId()
    console.log(messageId)
    const message: StoredDialogMessage = {
      createdAt: timestamp,
      messageId,
      sender: sender,
      message: request.message,
      attachments: request.attachments,
      clientMessageId: request.clientMessageId,
      read: timestamp,
      dlvrd: timestamp,
    }
    this.#messages[messageId] = message

    await this.ctx.storage.put<StoredDialogMessage>(`message-${messageId}`, message)
    if (messageId > 0) {
      if (this.#messages[messageId - 1].sender !== sender) {
        await this.read(sender, { chatId: request.chatId, messageId: messageId - 1 }, timestamp)
      }
    }
    const lastRead = this.#lastRead.get(sender)
    if (!lastRead || lastRead < messageId) {
      this.#lastRead.set(sender, messageId)
      await this.ctx.storage.put(`lastRead`, lastRead)
    }

    await this.ctx.storage.setAlarm(new Date(Date.now() + 50))
    return { messageId, timestamp, clientMessageId: message.clientMessageId }
  }
  closeCall(sender: string, request: CallNewMessageRequest) {
    return
  }
  async dlvrd(
    sender: string,
    request: MarkDeliveredRequest,
    timestamp: number,
  ): Promise<MarkDlvrdResponse> {
    return { ...request, messageId: this.#counter - 1, timestamp: this.#timestamp }
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
    const { messageId, clientMessageId } = this.#messages[endIndex]
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
      await this.ctx.storage.put<StoredDialogMessage>(`message-${message.messageId}`, message, {
        allowConcurrency: false,
      })
    }
    await this.sendReadEventToAuthor(this.#id, messageId, timestamp)

    return { chatId: request.chatId, messageId, timestamp, missed: 0, clientMessageId }
  }

  private async sendReadEventToAuthor(receiverId: string, messageId: number, timestamp: number) {
    // Retrieve sender and receiver's durable object IDs
    if (receiverId === 'ai') return
    const receiverDO = userStorage(this.env, receiverId)

    // Create an event object with message details and timestamp
    const event: MarkReadInternalEvent = {
      chatId: 'AI',
      messageId,
      timestamp,
      clientMessageId: this.#messages[messageId].clientMessageId,
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
    const keys = [...Array(this.#counter).keys()].map(i => `message-${i}`)
    const keyChunks = splitArray(keys, 128)

    for (const chunk of keyChunks) {
      const messagesChunk = await this.ctx.storage.get<StoredDialogMessage>(chunk)
      for (const key of messagesChunk.keys()) {
        const i = keys.indexOf(key)
        const message = messagesChunk.get(key)
        if (message) {
          this.#messages[i] = message
        }
      }
    }
    if (this.#messages.length) {
      const lastMessage = this.#messages.slice(-1)[0]
      if (lastMessage.sender === 'ai' && !lastMessage.read) {
        this.#lastRead.set(this.#id, lastMessage.messageId - 1)
      } else {
        this.#lastRead.set(this.#id, lastMessage.messageId)
      }
    }
  }

  private timestamp() {
    const current = performance.now()
    return (this.#timestamp = current > this.#timestamp ? current : ++this.#timestamp)
  }
}
