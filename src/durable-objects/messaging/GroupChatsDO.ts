import { DurableObject } from 'cloudflare:workers'
import { Group } from '~/types/Chat'
import { GroupChatMessage } from '~/types/ChatMessage'
import {
  GetMessagesRequest,
  MarkDeliveredRequest,
  MarkReadRequest,
  NewMessageRequest,
} from '~/types/ws/client-requests'
import {
  InternalEvent,
  InternalEventType,
  MarkDeliveredInternalEvent,
  MarkReadInternalEvent,
  NewGroupMessageEvent,
  Timestamp,
  UserId,
} from '~/types/ws/internal'
import { ChatsEvent, NewMessageEvent, ServerEvent } from '~/types/ws/server-events'
import { Env } from '../../types/Env'
import { DEFAULT_PORTION, MAX_PORTION } from './constants'
import { MarkDlvrdResponse, MarkReadResponse, NewMessageResponse } from '~/types/ws/responses'
import { MessageStatus } from '~/types/ChatList'
import { userStorage } from './utils/mdo'

export type OutgoingEvent = {
  type: InternalEventType
  receiver: UserId
  sender: UserId
  event: InternalEvent
  timestamp: Timestamp
}

export class GroupChatsDO extends DurableObject {
  #timestamp = Date.now()
  #messages: GroupChatMessage[] = []
  group!: Group
  #id: string = ''
  #counter = 0
  #lastRead = new Map<string, number>()
  #outgoingEvets: OutgoingEvent[] = []
  constructor(
    public ctx: DurableObjectState,
    public env: Env,
  ) {
    super(ctx, env)
    this.ctx.blockConcurrencyWhile(async () => this.initialize())
  }

  async alarm(): Promise<void> {
    const tasks: ((...args: any[]) => Promise<void>)[] = []
    const completed: number[] = []
    for (const i in this.#outgoingEvets) {
      const { timestamp, type, event, sender, receiver } = this.#outgoingEvets[i]

      try {
        const receiverDO = userStorage(this.env, receiver)

        // Create an event object with message details and timestamp

        const reqBody = JSON.stringify({ ...event })
        const headers = new Headers({ 'Content-Type': 'application/json' })

        const resp = await receiverDO.fetch(
          new Request(`${this.env.ORIGIN}/${receiver}/group/event/${type}`, {
            method: 'POST',
            body: reqBody,
            headers,
          }),
        )
        if (resp.status === 200) {
          completed.push(parseInt(i))
        } else {
          console.error(await resp.text())
        }
      } catch (e) {
        console.error(e)
      }
    }

    completed.sort((a, b) => b - a)
    for (let i = 0; i < completed.length; i++) {
      this.#outgoingEvets.splice(completed[i], 1)
    }
    if (this.#outgoingEvets.length > 0) {
      this.ctx.storage.setAlarm(Date.now() + 1400, { allowConcurrency: true })
    }
  }
  // Initialize storage for group chats
  async initialize() {
    const meta = await this.ctx.storage.get<Group>('meta')
    console.log(meta)
    if (!meta) {
      return
    }
    this.#id = meta.chatId
    this.group = meta
    this.#counter = (await this.ctx.storage.get<number>('counter')) || 0

    this.#messages = []
    for (let i = 0; i < this.#counter; i++) {
      const m = await this.ctx.storage.get<GroupChatMessage>(`message-${i}`)
      if (m) {
        if (!m.delivering) m.delivering = []
        this.#messages.push(m)
      }
    }

    const participants = Array.from(this.group.meta.participants)
    for (let i = this.#counter - 1; i >= 0; i--) {
      const m = this.#messages[i]
      if (!m) continue
      if (m.delivering?.length) {
        for (const d of m.delivering) {
          if (d.read) {
            const j = participants.findIndex(e => e === d.userId)
            if (j >= 0) {
              this.#lastRead.set(d.userId, m.messageId)
              participants.splice(j, 1)
            }
          }
        }
      }
      if (!participants.length) {
        break
      }
    }
  }
  private async newId() {
    this.#counter++
    await this.ctx.storage.put('counter', this.#counter - 1)
    return this.#counter - 1
  }
  private timestamp() {
    const current = performance.now()
    if (current > this.#timestamp) {
      this.#timestamp = current
      return current
    }
    this.#timestamp++
    return this.#timestamp
  }

  chat(userId: string): Group {
    const lastMessage = this.#messages.length ? this.#messages.slice(-1)[0] : undefined
    const chat: Group = {
      chatId: this.group.chatId,
      lastMessageId: lastMessage?.messageId,
      photoUrl: this.group.photoUrl,
      type: 'group',
      meta: this.group.meta,
      missed: this.#counter - (this.#lastRead.get(userId) || 0) - 1,
      lastMessageText: lastMessage?.message,
      lastMessageTime: lastMessage?.createdAt,
      lastMessageAuthor: lastMessage?.sender,
      lastMessageStatus: this.messageStatus(lastMessage),
      isMine: userId === lastMessage?.sender,
      name: this.group.name,
    }

    return chat
  }

  private messageStatus(lastMessage?: GroupChatMessage): MessageStatus {
    if (!lastMessage || !lastMessage.delivering) return 'undelivered'
    return lastMessage.delivering.filter(m => m.read && m.userId !== lastMessage.sender).length ===
      this.group.meta.participants.length - 1
      ? 'read'
      : lastMessage.delivering.filter(m => m.dlvrd).length
        ? 'unread'
        : 'undelivered'
  }

  counter() {
    return this.#messages.length
  }

  async getMessages(payload: GetMessagesRequest): Promise<GroupChatMessage[]> {
    if (!this.#messages) return []
    const endIndex = payload.endId || this.#messages.length - 1
    const portion = payload.count ? Math.min(MAX_PORTION, payload.count) : DEFAULT_PORTION
    const startIndex = endIndex > portion ? endIndex - portion + 1 : 0
    const messages = this.#messages.slice(startIndex, endIndex + 1).filter(m => !!m)
    return messages
  }

  async newMessage(sender: string, request: NewMessageRequest): Promise<NewMessageResponse> {
    const timestamp = this.timestamp()
    const messageId = await this.newId()
    console.log(messageId)
    const message: GroupChatMessage = {
      createdAt: timestamp,
      messageId,
      sender: sender,
      message: request.message,
      attachments: request.attachments,
      clientMessageId: request.clientMessageId,
      delivering: [],
    }
    this.#messages[messageId] = message
    const event: NewGroupMessageEvent = {
      chatId: this.group.chatId,
      message: message.message,
      attachments: message.attachments,
      type: 'group',
      sender: message.sender,
      clientMessageId: request.clientMessageId,
      messageId: message.messageId,
    }
    await this.broadcastEvent('new', event, sender, sender)

    await this.ctx.storage.put<GroupChatMessage>(`message-${messageId}`, message)
    await this.ctx.storage.put<number>('counter', this.#messages.length)

    if (messageId > 0) {
      if (this.#messages[messageId - 1]?.sender !== sender) {
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
      endIndex = this.#messages.findLastIndex(m => m && m.messageId === request.messageId)

      if (endIndex === -1) {
        throw new Error(`messageId is not exists`)
      }
    }
    const messageId = this.#messages[endIndex].messageId

    for (let i = endIndex; i >= 0; i--) {
      const message = this.#messages[i]
      if (!message) continue
      if (message.sender === sender) {
        continue
      }
      let d = message.delivering?.find(d => d.userId === sender)
      if (!d) {
        d = message.delivering![message.delivering!.push({ userId: sender, dlvrd: timestamp })]
      } else if (d.dlvrd) {
        break
      }
      d.dlvrd = timestamp

      await this.ctx.storage.put<GroupChatMessage>(`message-${message.messageId}`, message, {
        allowConcurrency: false,
      })
    }

    await this.broadcastEvent(
      'dlvrd',
      {
        chatId: request.chatId,
        messageId,
        timestamp,
        userId: sender,
      } as MarkReadInternalEvent,
      sender,
      sender,
    )
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
      if (!message) continue
      if (message.sender === sender) {
        continue
      }
      let d = message.delivering?.find(d => d.userId === sender)
      if (!d) {
        d =
          message.delivering![
            message.delivering!.push({ userId: sender, read: timestamp, dlvrd: timestamp }) - 1
          ]
      } else if (d.read) {
        break
      }
      d.read = timestamp
      if (!d.dlvrd) d.dlvrd = timestamp
      await this.ctx.storage.put<GroupChatMessage>(`message-${message.messageId}`, message, {
        allowConcurrency: false,
      })
    }
    await this.broadcastEvent(
      'read',
      {
        chatId: request.chatId,
        messageId,
        timestamp,
        userId: sender,
      } as MarkReadInternalEvent,
      sender,
      sender,
    )

    return { messageId, timestamp, missed: this.#counter - (this.#lastRead.get(sender) || 0) - 1 }
  }

  // Create a new group chat
  async createGroupChat(
    id: string,
    name: string,
    imgUrl: string,
    participants: string[],
    owner: string,
  ) {
    if (!name || !participants) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 })
    }

    const newChat: Group = {
      chatId: id,
      lastMessageId: 0,
      photoUrl: imgUrl,
      type: 'group',
      name,
      missed: 0,
      meta: {
        name,
        createdAt: Date.now(),
        participants,
        owner,
      },
    }
    this.group = newChat
    this.#id = id
    await this.ctx.storage.put<Group>(`meta`, newChat)
    await this.initialize()

    await this.broadcastEvent('newChat', { ...newChat }, owner)

    return newChat
  }

  async broadcastEvent(
    type: InternalEventType,
    event: InternalEvent,
    sender: UserId,
    exclude?: UserId,
  ) {
    this.ctx.storage.deleteAlarm({ allowConcurrency: true })
    for (const receiver of this.group!.meta.participants) {
      if (exclude === receiver) continue
      this.#outgoingEvets.push({ event, sender, receiver, type, timestamp: this.#timestamp })

      this.ctx.storage.setAlarm(Date.now() + 400, { allowConcurrency: true })
    }
  }
}
