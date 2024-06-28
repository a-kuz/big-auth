import { DurableObject } from 'cloudflare:workers'
import { writeErrorLog } from '~/utils/serialize-error'
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
  NewChatEvent,
  NewGroupMessageEvent,
  Timestamp,
  UserId,
} from '~/types/ws/internal'
import { MarkDlvrdResponse, MarkReadResponse, NewMessageResponse } from '~/types/ws/responses'
import { splitArray } from '~/utils/split-array'
import { Env } from '../../types/Env'
import { DEFAULT_PORTION, MAX_PORTION } from './constants'
import { userStorage } from './utils/mdo'
import { displayName } from '~/services/display-name'
import { NotFoundError } from '~/errors/NotFoundError'
import { MarkPointer, Marks } from '~/types/Marks'

export type OutgoingEvent = {
  type: InternalEventType
  receiver: UserId
  sender: Profile
  event: InternalEvent
  timestamp: Timestamp
}

const MESSAGES_LOAD_CHUNK_SIZE = 128
export class GroupChatsDO extends DurableObject {
  #timestamp = Date.now()
  #messages: GroupChatMessage[] = []
  group!: Group
  #id: string = ''
  #counter = 0
  #users: Profile[] = []

  #storage!: DurableObjectStorage
  #lastReadMark = new Map<string, MarkPointer>()
  #lastDlvrdMark = new Map<string, MarkPointer>()
  #readMarks: Marks = {}
  #dlvrdMarks: Marks = {}
  #outgoingEvets: OutgoingEvent[] = []
  #runningEvents: OutgoingEvent[] = []
  constructor(
    public ctx: DurableObjectState,
    public env: Env,
  ) {
    super(ctx, env)
    this.#storage = ctx.storage
    this.ctx.blockConcurrencyWhile(async () => this.initialize())
  }

  async alarm(): Promise<void> {
    console.log('Goup ALARM')

    try {
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
                  .catch(async error => await writeErrorLog(error))
              }
            })
            .catch(async error => await writeErrorLog(error))
        } catch (e) {
          await writeErrorLog(e)
        }
      }

      if (this.#outgoingEvets.length > 0 || this.#runningEvents.length > 0) {
        await this.#storage.setAlarm(Date.now() + 50, { allowConcurrency: false })
      }

      this.#outgoingEvets = [
        ...this.#outgoingEvets,
        ...this.#runningEvents.filter(e => e.timestamp < Date.now() - 3000),
      ]
      this.#runningEvents = this.#runningEvents.filter(e => e.timestamp >= Date.now() - 3000)
    } catch (e) {
      await writeErrorLog(e)
    }
  }

  async fetchUsers() {
    if (!this.group?.meta?.participants) {
      return false
    }

    for (const u of this.group.meta.participants) {
      const userId: string = (u as Profile).id ?? u
      const user = await getUserById(
        this.env.DB,
        userId,
        new NotFoundError(`User not found ${JSON.stringify({ userId })}`),
      )
      const row = this.#users.findIndex(u => u.id === user.id)
      if (!(row === -1)) {
        this.#users.splice(row, 1)
      }
      const { lastName, firstName, id, username, phoneNumber, avatarUrl } = user
      this.#users.push({ lastName, firstName, id, username, phoneNumber, avatarUrl })
    }
    for (let i = this.#users.length - 1; i >= 0; i--) {
      if ((this.group.meta?.participants as string[])?.indexOf(this.#users[i].id) === -1) {
        this.#users.splice(i, 1)
      }
    }
    return true
  }
  // Initialize storage for group chats
  async initialize() {
    const start = performance.now()
    const meta = await this.#storage.get<Group>('meta')
    this.#users = (await this.#storage.get<Profile[]>('users')) || []
    console.log(meta)
    if (!meta) {
      return
    }
    this.#id = meta.chatId
    this.group = meta
    this.#counter = ((await this.#storage.get<number>('counter')) || 1000) + 1000

    this.#messages = []

    const keys = [...Array(this.#counter).keys()].map(i => `message-${i}`)
    this.#counter = -1
    const keyChunks = splitArray(keys, MESSAGES_LOAD_CHUNK_SIZE)

    for (const chunk of keyChunks) {
      const messagesChunk = await this.#storage.get<GroupChatMessage>(chunk)
      for (const key of messagesChunk.keys()) {
        const i = keys.indexOf(key)
        const message = messagesChunk.get(key)
        if (message) {
          this.#messages[i] = message
          this.#counter = Math.max(this.#counter, i + 1)
        }
      }
    }

    for (const user of this.group.meta.participants as string[]) {
      this.#readMarks[user] = []
      this.#dlvrdMarks[user] = []

      const lastReadMark = await this.#storage.get<MarkPointer>(`lastRead-${user}`)
      if (lastReadMark) {
        this.#lastReadMark.set(user, lastReadMark)
        this.#readMarks[user][lastReadMark.index] = [
          lastReadMark.messageId,
          lastReadMark.timestamp,
        ]
      }

      const lastDlvrdMark = await this.#storage.get<MarkPointer>(`lastDlvrd-${user}`)
      if (lastDlvrdMark) {
        this.#lastDlvrdMark.set(user, lastDlvrdMark)
        this.#dlvrdMarks[user][lastDlvrdMark.index] = [
          lastDlvrdMark.messageId,
          lastDlvrdMark.timestamp,
        ]
      }
    }
    const end = performance.now()
    console.log('init group', `${Math.round((end - start) / 100) / 10}s`)
  }
  private async newId() {
    await this.#storage.put('counter', ++this.#counter)
    return this.#counter
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

  async getMessages(payload: GetMessagesRequest, userId: string): Promise<GetMessagesResponse> {
    if (!this.#messages) return { messages: [], authors: [] }

    let messages = []
    if (!payload.startId) {
      const endIndex = payload.endId || this.#messages.length
      const portion = payload.count ? Math.min(MAX_PORTION, payload.count) : DEFAULT_PORTION
      const startIndex = endIndex > portion ? endIndex - portion : 0
      messages = await this.loadMessages(startIndex, endIndex, userId)
    } else {
      const portion = payload.count ? Math.min(MAX_PORTION, payload.count) : DEFAULT_PORTION
      const startIndex = payload.startId
      const endIndex = startIndex + portion
      messages = await this.loadMessages(startIndex, endIndex, userId)
    }
    // Collect userIds from the senders of the returned messages
    const senderIds = new Set(messages.map(m => m.sender))
    const authors = this.#users.filter(u => senderIds.has(u.id))
    return { messages, authors }
  }

  async loadMessages(startId: number, endId: number, userId: string) {
    const missedIds = []
    for (let i = startId; i <= endId; i++) {
      if (!this.#messages[i]) {
        missedIds.push(i)
      }
    }
    const keys = missedIds.map(i => `message-${i}`)
    const keyChunks = splitArray(keys, 128)

    for (const chunk of keyChunks) {
      const messagesChunk = await this.#storage.get<GroupChatMessage>(chunk)
      for (const key of messagesChunk.keys()) {
        const i = keys.indexOf(key)
        const message = messagesChunk.get(key)
        if (message) {
          this.#messages[i] = message
        }
      }
    }
    const messages = this.#messages.slice(startId, endId).filter(m => !!m)

    if (messages.length === 0) {
      return messages
    }

    const { readMarks, dlvrdMarks } = await this.loadMarks(startId, endId, userId)
    let readMark = readMarks.length ? readMarks[0] : undefined
    let dlvrdMark = dlvrdMarks.length ? dlvrdMarks[0] : undefined

    for (const message of messages) {
      if (message.sender !== userId) continue
      if (readMark) {
        if (readMark[0] < message.messageId) {
          readMark = readMarks[readMarks.indexOf(readMark) + 1] ?? undefined
        }
      }
      if (dlvrdMark) {
        if (dlvrdMark[0] < message.messageId) {
          dlvrdMark = dlvrdMarks[dlvrdMarks.indexOf(dlvrdMark) + 1] ?? undefined
        }
      }

      message.delivering = message.delivering || []
      const delivering = message.delivering.find(d => d.userId === userId)
      if (delivering) {
        delivering.read = readMark ? readMark[1] : undefined
        delivering.dlvrd = dlvrdMark ? dlvrdMark[1] : undefined
      } else {
        message.delivering.push({
          userId,
          read: readMark ? readMark[1] : undefined,
          dlvrd: dlvrdMark ? dlvrdMark[1] : undefined,
        })
      }
    }
    return messages
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
    await this.#storage.put<GroupChatMessage>(`message-${messageId}`, message)

    for (const receiver of (this.group.meta.participants as string[]).filter(m => m !== sender)) {
      const event: NewGroupMessageEvent = {
        chatId: this.group.chatId,
        message: message.message,
        attachments: message.attachments,
        sender: message.sender,
        senderName: displayName(this.#users.find(u => u.id === message.sender)!),
        clientMessageId: request.clientMessageId,
        messageId: message.messageId,
        timestamp,
        missed: Math.max(this.#counter - (this.#lastRead.get(receiver) || 0), 0),
      }
      this.#outgoingEvets.push({
        event,
        sender: this.#users.find(u => u.id === sender)!,
        receiver: receiver as string,
        type: 'new',
        timestamp,
      })
    }

    if (messageId > 0) {
      if (this.#messages[messageId - 1] && this.#messages[messageId - 1].sender !== sender) {
        await this.read(sender, { chatId: request.chatId, messageId: messageId - 1 }, timestamp)
      }
    }
    const mark: Mark = [messageId, timestamp]
    const markPointer = { index: this.#readMarks[sender].length, messageId, timestamp }
    this.#lastReadMark.set(sender, markPointer)
    await this.#storage.put<MarkPointer>(`lastRead-${sender}`, markPointer)
    this.#readMarks[sender].push(mark)
    await this.#storage.put<Mark>(`read-${sender}-${this.#readMarks[sender].length - 1}`, mark)
    await this.#storage.setAlarm(Date.now() + 400, { allowConcurrency: false })
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

    const mark: Mark = [messageId, timestamp]
    const markPointer = { index: this.#dlvrdMarks[sender].length, messageId, timestamp }
    this.#lastDlvrdMark.set(sender, markPointer)
    await this.#storage.put<MarkPointer>(`lastDlvrd-${sender}`, markPointer)
    this.#dlvrdMarks[sender].push(mark)
    await this.#storage.put<Mark>(`dlvrd-${sender}-${this.#dlvrdMarks[sender].length - 1}`, mark)
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
    const { messageId, clientMessageId } = this.#messages[endIndex]

    const messageSender = this.#messages[endIndex].sender
    const lastRead = this.#lastRead.get(sender)
    if (!lastRead || lastRead < messageId) {
      this.#lastRead.set(sender, messageId)
    }
    const mark: Mark = [messageId, timestamp]
    const markPointer = { index: this.#readMarks[sender].length, messageId, timestamp }
    this.#lastReadMark.set(sender, markPointer)
    await this.#storage.put<MarkPointer>(`lastRead-${sender}`, markPointer)
    this.#readMarks[sender].push(mark)
    await this.#storage.put<Mark>(`read-${sender}-${this.#readMarks[sender].length - 1}`, mark)
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
          clientMessageId,
        } as MarkReadInternalEvent,
        sender,
        messageSender,
      )

    return {
      chatId: request.chatId,
      messageId,
      timestamp,
			clientMessageId,
      missed: Math.max(this.#counter - (this.#lastRead.get(sender) || 0) - 1, 0),
    }
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
    await this.#storage.put('users', this.#users)
    await this.#storage.put<Group>(`meta`, newChat)
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
    await this.#storage.deleteAlarm()
    for (const receiver of this.group!.meta.participants as string[]) {
      if (exclude === receiver) continue
      this.#outgoingEvets.push({
        event,
        sender: this.#users.find(u => u.id === sender)!,
        receiver,
        type,
        timestamp: this.timestamp(),
      })
    }
    this.#storage.deleteAlarm()
    await this.#storage.setAlarm(Date.now() + 400, { allowConcurrency: false })
  }

  private async broadcastEventTo(
    type: InternalEventType,
    event: InternalEvent,
    sender: UserId,
    receiver: UserId,
  ) {
    this.#outgoingEvets.push({
      event,
      sender: this.#users.find(u => u.id === sender)!,
      receiver,
      type,
      timestamp: this.timestamp(),
    })

    await this.#storage.setAlarm(Date.now() + 400, { allowConcurrency: false })
  }

  async updateProfile(profile: Profile) {
    if (!this.#users) return
    const index = this.#users.findIndex(user => user.id === profile.id)
    if (index !== -1) {
      this.#users[index] = profile
    }
    await this.#storage.put('users', this.#users)
  }
}
