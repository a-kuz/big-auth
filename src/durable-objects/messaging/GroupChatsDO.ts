import { DurableObject } from 'cloudflare:workers'
import { serializeError } from 'serialize-error'
import { Profile, User } from '~/db/models/User'
import { getUserById } from '~/db/services/get-user'
import { Group } from '~/types/Chat'
import { MessageStatus } from '~/types/ChatList'
import { GroupChatMessage } from '~/types/ChatMessage'
import {
  GetMessagesRequest,
  GetMessagesResponse,
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
import { MarkDlvrdResponse, MarkReadResponse, NewMessageResponse } from '~/types/ws/responses'
import { splitArray } from '~/utils/split-array'
import { Env } from '../../types/Env'
import { DEFAULT_PORTION, MAX_PORTION } from './constants'
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
  #users: Profile[] = []
  #lastFetchUsers = 0
  #lastRead = new Map<string, number>()
  #outgoingEvets: OutgoingEvent[] = []
  #runningEvents: OutgoingEvent[] = []
  constructor(
    public ctx: DurableObjectState,
    public env: Env,
  ) {
    super(ctx, env)
    this.ctx.blockConcurrencyWhile(async () => this.initialize())
  }

  async alarm(): Promise<void> {
    console.log('GROUp ALARM')
    if (this.#lastFetchUsers < Date.now() - 1000 * 10 * 5) {
      if (await this.fetchUsers()) {
        this.ctx.storage.setAlarm(Date.now() + 300)
        return
      }
    }
    try {
      const completed: number[] = []
      this.#outgoingEvets = this.#outgoingEvets
        .sort((a, b) => b.timestamp - a.timestamp)
        .filter(
          e =>
            e.type === 'new' ||
            this.#outgoingEvets.findLast(
              ee => e.type === ee.type && e.receiver === ee.receiver && e.sender === ee.sender,
            ) === e,
        )

      let n = 0

      for (let i = this.#outgoingEvets.length - 1; i >= 0; i--) {
        const { timestamp, type, event, sender, receiver } = this.#outgoingEvets[i]
        this.#runningEvents.push(this.#outgoingEvets[i])
        this.#outgoingEvets.splice(i, 1)
        n++
        if (n > 2) break
        try {
          const receiverDO = userStorage(this.env, receiver)

          // Create an event object with message details and timestamp

          const reqBody = JSON.stringify({ ...event })

          const resp = receiverDO
            .fetch(
              new Request(`${this.env.ORIGIN}/${receiver}/group/event/${type}`, {
                method: 'POST',
                body: reqBody,
              }),
            )
            .then(resp => {
              if (resp.status === 200) {
                console.log('task completed', JSON.stringify({ timestamp, type, receiver, event }))
                if (type === 'new') {
                  this.#outgoingEvets = [...this.#outgoingEvets].filter(
                    e =>
                      !(
                        e.type === type &&
                        e.receiver === receiver &&
                        e.sender === sender &&
                        e.timestamp === timestamp
                      ),
                  )
                  this.#runningEvents = [...this.#runningEvents].filter(
                    e =>
                      !(
                        e.type === type &&
                        e.receiver === receiver &&
                        e.sender === sender &&
                        e.timestamp === timestamp
                      ),
                  )
                } else {
                  this.#outgoingEvets = this.#outgoingEvets.filter(
                    e =>
                      !(
                        e.type === type &&
                        e.receiver === receiver &&
                        e.sender === sender &&
                        e.timestamp <= timestamp
                      ),
                  )
                  this.#runningEvents = this.#runningEvents.filter(
                    e =>
                      !(
                        e.type === type &&
                        e.receiver === receiver &&
                        e.sender === sender &&
                        e.timestamp <= timestamp
                      ),
                  )
                }
              } else {
                resp
                  .text()
                  .then(text => console.error(text))
                  .catch(error => console.error(serializeError(error)))
              }
            })
            .catch(e => console.error(serializeError(e)))
        } catch (e) {
          console.error(serializeError(e))
        }
      }

      if (this.#outgoingEvets.length > 0 || this.#runningEvents.length > 0) {
        await this.ctx.storage.setAlarm(Date.now() + 50, { allowConcurrency: false })
      }

      this.#outgoingEvets = [
        ...this.#outgoingEvets,
        ...this.#runningEvents.filter(e => e.timestamp < Date.now() - 3000),
      ]
      this.#runningEvents = this.#runningEvents.filter(e => e.timestamp >= Date.now() - 3000)
    } catch (e) {
      console.error(serializeError(e))
    }
  }

  async fetchUsers() {
    if (!this.group?.meta?.participants) {
      return false
    }
    this.#lastFetchUsers = Date.now()
    for (const u of this.group.meta.participants) {
      const user = await getUserById(this.env.DB, u)
      const row = this.#users.findIndex(u => u.id === user.id)
      if (!(row === -1)) {
        this.#users.splice(row, 1)
      }
      const { lastName, firstName, id, username, phoneNumber, avatarUrl } = user
      this.#users.push({ lastName, firstName, id, username, phoneNumber, avatarUrl })
    }
    for (let i = this.#users.length - 1; i >= 0; i--) {
      if (this.group.meta?.participants?.indexOf(this.#users[i].id) === -1) {
        this.#users.splice(i, 1)
      }
    }
    return true
  }
  // Initialize storage for group chats
  async initialize() {
    const start = performance.now()
    const meta = await this.ctx.storage.get<Group>('meta')
    this.#users = (await this.ctx.storage.get<Profile[]>('users')) || []
    console.log(meta)
    if (!meta) {
      return
    }
    this.#id = meta.chatId
    this.group = meta
    this.#counter = (await this.ctx.storage.get<number>('counter')) || 0

    this.#messages = []
    let arr = []
    const keys = [...Array(this.#counter).keys()].map(i => `message-${i}`)
    const keyChunks = splitArray(keys, 128)

    for (const chunk of keyChunks) {
      const messagesChunk = await this.ctx.storage.get<GroupChatMessage>(chunk)
      for (const key of messagesChunk.keys()) {
        const i = keys.indexOf(key)
        const message = messagesChunk.get(key)
        if (message) {
          this.#messages[i] = message
        }
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
    const end = performance.now()
    console.log('init group', `${Math.round((end - start) / 100) / 10}s`)
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
      chatId: this.group?.chatId,
      lastMessageId: lastMessage?.messageId,
      photoUrl: this.group?.photoUrl,
      type: 'group',
      meta: { ...this.group.meta, participants: this.#users },
      missed: Math.max(this.#counter - (this.#lastRead.get(userId) || 0) - 1, 0),
      lastMessageText: lastMessage?.message,
      lastMessageTime: lastMessage?.createdAt,
      lastMessageAuthor: lastMessage?.sender,
      lastMessageStatus: this.messageStatus(lastMessage),
      isMine: userId === lastMessage?.sender,
      name: this.group?.name,
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

  async getMessages(payload: GetMessagesRequest): Promise<GetMessagesResponse> {
    if (!this.#messages) return { messages: [], authors: [] }

    const endIndex = payload.endId || this.#messages.length - 1
    const portion = payload.count ? Math.min(MAX_PORTION, payload.count) : DEFAULT_PORTION
    const startIndex = endIndex > portion ? endIndex - portion + 1 : 0
    const messages = this.#messages.slice(startIndex, endIndex + 1).filter(m => !!m)

    // Collect userIds from the senders of the returned messages
    const senderIds = new Set(messages.map(m => m.sender))
    const authors = this.#users.filter(u => senderIds.has(u.id))
    return { messages, authors }
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
    await this.ctx.storage.put<GroupChatMessage>(`message-${messageId}`, message)

    for (const receiver of this.group.meta.participants.filter(m => m !== sender)) {
      const event: NewGroupMessageEvent = {
        chatId: this.group.chatId,
        message: message.message,
        attachments: message.attachments,
        sender: message.sender,
        clientMessageId: request.clientMessageId,
        messageId: message.messageId,
        timestamp,
        missed: Math.max(this.#counter - (this.#lastRead.get(receiver) || 0) - 1, 0),
      }
      this.#outgoingEvets.push({ event, sender, receiver, type: 'new', timestamp })
    }

    if (messageId > 0) {
      if (this.#messages[messageId - 1] && this.#messages[messageId - 1].sender !== sender) {
        await this.read(sender, { chatId: request.chatId, messageId: messageId - 1 }, timestamp)
      }
    }
    const lastRead = this.#lastRead.get(sender)
    if (!lastRead || lastRead < messageId) {
      this.#lastRead.set(sender, messageId)
    }
    await this.ctx.storage.setAlarm(Date.now() + 400, { allowConcurrency: false })
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
    const lastMessage = this.#messages[endIndex]
    const messageSender = lastMessage.sender
    if (lastMessage.delivering && lastMessage.delivering.length === 1)
      await this.broadcastEventTo(
        'dlvrd',
        {
          chatId: request.chatId,
          messageId,
          timestamp,
          userId: sender,
        } as MarkDeliveredInternalEvent,
        sender,
        messageSender,
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
      endIndex = this.#messages.findLastIndex(m => m.messageId <= request.messageId!)

      if (endIndex === -1) {
        throw new Error(`messageId is not exists`)
      }
    }
    const messageId = this.#messages[endIndex].messageId
    const messageSender = this.#messages[endIndex].sender
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
    const lastMessage = this.#messages[endIndex]
    if (
      lastMessage.delivering &&
      lastMessage.delivering.length >= this.group.meta.participants.length - 1
    )
      await this.broadcastEventTo(
        'read',
        {
          chatId: request.chatId,
          messageId,
          timestamp,
          userId: sender,
        } as MarkReadInternalEvent,
        sender,
        messageSender,
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
    await this.fetchUsers()
    await this.ctx.storage.put('users', this.#users)
    await this.ctx.storage.put<Group>(`meta`, newChat)
    await this.initialize()

    await this.broadcastEvent('newChat', { ...newChat }, owner)

    return newChat
  }

  private async broadcastEvent(
    type: InternalEventType,
    event: InternalEvent,
    sender: UserId,
    exclude?: UserId,
  ) {
    await this.ctx.storage.deleteAlarm()
    for (const receiver of this.group!.meta.participants) {
      if (exclude === receiver) continue
      this.#outgoingEvets.push({ event, sender, receiver, type, timestamp: this.timestamp() })
    }
    this.ctx.storage.deleteAlarm()
    await this.ctx.storage.setAlarm(Date.now() + 400, { allowConcurrency: false })
  }

  private async broadcastEventTo(
    type: InternalEventType,
    event: InternalEvent,
    sender: UserId,
    receiver: UserId,
  ) {
    this.#outgoingEvets.push({ event, sender, receiver, type, timestamp: this.timestamp() })

    await this.ctx.storage.setAlarm(Date.now() + 400, { allowConcurrency: false })
  }
}
