import { Profile } from '~/db/models/User'
import { getUserById } from '~/db/services/get-user'
import { NotFoundError } from '~/errors/NotFoundError'
import { displayName } from '~/services/display-name'
import { Call, Group } from '~/types/Chat'
import { MessageStatus } from '~/types/ChatList'
import { CallOnMessage, CallPayload, GroupChatMessage, StoredGroupMessage } from '~/types/ChatMessage'
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
  CloseCallEvent,
	InternalEvent,
	InternalEventType,
	MarkDeliveredInternalEvent,
	MarkReadInternalEvent,
	NewCallEvent,
	NewGroupMessageEvent,
	Timestamp,
	UserId
} from '~/types/ws/internal'
import { DeleteResponse, MarkDlvrdResponse, MarkReadResponse, NewMessageResponse } from '~/types/ws/responses'
import { writeErrorLog } from '~/utils/serialize-error'
import { splitArray } from '~/utils/split-array'
import { Env } from '../../types/Env'
import { DEFAULT_PORTION, MAX_PORTION } from './constants'
import { userStorage } from './utils/mdo'
import { DebugWrapper } from '../DebugWrapper'
import { DeleteEvent } from '~/types/ws/server-events'

export type OutgoingEvent = {
  type: InternalEventType
  receiver: UserId
  sender: Profile
  event: InternalEvent
  timestamp: Timestamp
}

const MESSAGES_LOAD_CHUNK_SIZE = 128
export class GroupChatsDO extends DebugWrapper {
  #timestamp = Date.now()
  #messages: StoredGroupMessage[] = []
  group!: Group
  #id: string = ''
  #counter = 0
  #users: Profile[] = []
  #call?: Call
  #storage!: DurableObjectStorage
  #lastRead = new Map<string, number>()
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

  async fetchUsers(participants: string[]) {
    

    for (const userId of participants) {
      
      const user = await getUserById(
        this.env.DB,
        userId,
        new NotFoundError(`User not found ${JSON.stringify({ userId })}`),
      )
      const row = this.#users.findIndex(u => u.id === user.id)
      if (!(row === -1)) {
        this.#users.splice(row, 1)
      }
      const { lastName, firstName, id, username, phoneNumber, avatarUrl, verified } = user
      this.#users.push({ lastName, firstName, id, username, phoneNumber, avatarUrl, verified })
    }
    for (let i = this.#users.length - 1; i >= 0; i--) {
      if (participants.indexOf(this.#users[i].id) === -1) {
        this.#users.splice(i, 1)
      }
    }
    return this.#users
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
    this.#call = await this.#storage.get<Call>('call')
    for (const chunk of keyChunks) {
      const messagesChunk = await this.#storage.get<StoredGroupMessage>(chunk)
      for (const key of messagesChunk.keys()) {
        const i = keys.indexOf(key)
        const message = messagesChunk.get(key)
        if (message) {
          this.#messages[i] = message
          this.#counter = Math.max(this.#counter, i + 1)
        }
      }
    }

    const participants = this.#users.map(user=>user.id)
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
    await this.#storage.put('counter', ++this.#counter)
    return this.#counter
  }

  private timestamp() {
    const current = performance.now()
    return (this.#timestamp = current > this.#timestamp ? current : ++this.#timestamp)
  }

  chat(userId: string): Group {
    const lastMessage = this.#messages.length ? this.#messages.slice(-1)[0] : undefined

    const chat: Group = {
      chatId: this.group?.chatId,
      lastMessageId: lastMessage?.messageId,
      photoUrl: this.group?.photoUrl,
      type: 'group',
      meta: this.group.meta,
      ...this.missedFor(userId),
      lastMessageText: lastMessage?.message,
      lastMessageTime: lastMessage?.createdAt,
      lastMessageAuthor: lastMessage?.sender,
      lastMessageStatus: this.messageStatus(lastMessage),
      isMine: userId === lastMessage?.sender,
      name: this.group?.name,
      call: this.#call,
    }

    return chat
  }

  private missedFor(userId: string) {
    const missed = Math.max(this.#counter - (this.#lastRead.get(userId) || 0) - 1, 0)
    if (!missed) {
      return { missed }
    }
    const lastMessage = this.#messages.length ? this.#messages.slice(-1)[0] : undefined
    if (!lastMessage) return { missed }
    const firstMissed = this.#messages[lastMessage.messageId - missed + 1].clientMessageId
    return { missed, firstMissed }
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
  async newCall(callId: string, ownerCallId: string) {
    this.#call = {
      callId,
      createdAt: Date.now(),
    }
    await this.#storage.put('call', this.#call)
    const _newCall: NewCallEvent = {
      chatId: this.#id,
      callId,
      createdAt: this.#call.createdAt,
    }
    await this.broadcastEvent('newCall', { ..._newCall }, ownerCallId)
  }
  async closeCall(callId: string,ownerCallId:string) {
    this.#call = undefined
    await this.#storage.put('call', this.#call)
    const _closeCall: CloseCallEvent = {
      chatId: this.#id,
      callId
    }
    await this.broadcastEvent('closeCall', { ..._closeCall }, ownerCallId)
  }
  prepareCallFor(message: StoredGroupMessage, userId: string): GroupChatMessage {
    if (message.type != 'call') return message
    if (message.payload) {
      const payload: CallPayload = message.payload as CallPayload
      const call: CallOnMessage= {
        callType: payload.callType,
        status: payload.participants?.includes(userId) ? 'received' : 'missed',
        direction: payload.caller == userId ? 'outcoming' : 'incoming'
      }
      const preparadMessageOnCall: GroupChatMessage = {
        ...message,
        call
      }
      return preparadMessageOnCall
    }
    return message
  }
  async getMessages(payload: GetMessagesRequest, userId: string): Promise<GetMessagesResponse> {
    if (!this.#messages) return { messages: [], authors: [] }

    let messages = []
    if (!payload.startId) {
      const endIndex = payload.endId || this.#messages.length - 1
      const portion = payload.count ? Math.min(MAX_PORTION, payload.count) : DEFAULT_PORTION
      const startIndex = endIndex > portion ? endIndex - portion + 1 : 0
      messages = this.#messages.slice(startIndex, endIndex + 1).filter(m => !!m)
    } else {
      const portion = payload.count ? Math.min(MAX_PORTION, payload.count) : DEFAULT_PORTION
      const startIndex = payload.startId
      const endIndex = startIndex + portion - 1
      messages = this.#messages.slice(startIndex, endIndex + 1).filter(m => !!m)
    }
    // Collect userIds from the senders of the returned messages
    const senderIds = new Set(messages.map(m => m.sender))
    const authors = this.#users.filter(u => senderIds.has(u.id))
    messages = messages.map(m => this.prepareCallFor(m, userId))
    return { messages, authors }
  }

  async deleteMessage(sender: string, request: DeleteRequest): Promise<DeleteResponse> {
    const { originalMessageId, chatId } = request
    const messageIndex = this.#messages.findIndex(m => m.messageId === originalMessageId)
    if (messageIndex === -1) {
      throw new Error(`Message with ID ${originalMessageId} does not exist`)
    }
    const message = this.#messages[messageIndex]
    message.deletedAt = this.timestamp()
    message.message = undefined
    message.attachments = undefined
    await this.#storage.put(`message-${originalMessageId}`, message)

    

    const messageId = await this.newId()
    const clientMessageId = `dlt-${messageId}-${newId(3)}`
    const serviceMessage: GroupChatMessage = {
      messageId,
      clientMessageId,
      sender,
      type: 'delete',
      payload: { originalMessageId },
      createdAt: message.deletedAt,
    }

    this.#messages[serviceMessage.messageId] = serviceMessage
    await this.#storage.put(`message-${serviceMessage.messageId}`, serviceMessage)

    const deleteMessageEvent: DeleteEvent = {
      originalMessageId,
      chatId,
      messageId,
    }

    

    

    await this.broadcastEvent('delete', deleteMessageEvent, request.chatId)

    return { messageId, timestamp: message.deletedAt }
  }

  async newMessage(sender: string, request: NewMessageRequest): Promise<NewMessageResponse> {
    const timestamp = this.timestamp()
    const messageId = await this.newId()
    console.log(messageId)
    const message: StoredGroupMessage = {
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

    for (const receiver of this.#users.filter(m => m.id !== sender)) {
      const event: NewGroupMessageEvent = {
        chatId: this.group.chatId,
        message: message.message,
        attachments: message.attachments,
        sender: message.sender,
        senderName: displayName(this.#users.find(u => u.id === message.sender)!),
        clientMessageId: request.clientMessageId,
        messageId: message.messageId,
        timestamp,
        ...this.missedFor(receiver.id),
      }
      this.#outgoingEvets.push({
        event,
        sender: this.#users.find(u => u.id === sender)!,
        receiver: receiver.id,
        type: 'new',
        timestamp,
      })
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
    await this.#storage.setAlarm(Date.now() + 400, { allowConcurrency: false })
    return { messageId, timestamp, clientMessageId: message.clientMessageId }
  }
  async callNewMessage(sender: string, request: CallNewMessageRequest): Promise<NewMessageResponse> {
    const timestamp = this.timestamp()
    const messageId = await this.newId()
    console.log(messageId)
    const message: StoredGroupMessage = {
      createdAt: timestamp,
      messageId,
      sender: sender,
      clientMessageId: request.clientMessageId,
      delivering: [],
      type:'call',
      payload: request.payload
    }
    this.#messages[messageId] = message
    await this.#storage.put<GroupChatMessage>(`message-${messageId}`, message)

    for (const receiver of this.#users.filter(m => m.id !== sender)) {
      const event: NewGroupMessageEvent = {
        chatId: this.group.chatId,
        message: message.message,
        attachments: message.attachments,
        sender: message.sender,
        senderName: displayName(this.#users.find(u => u.id === message.sender)!),
        clientMessageId: request.clientMessageId,
        messageId: message.messageId,
        timestamp,
        ...this.missedFor(receiver.id),
      }
      this.#outgoingEvets.push({
        event,
        sender: this.#users.find(u => u.id === sender)!,
        receiver: receiver.id,
        type: 'new',
        timestamp,
      })
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

      await this.#storage.put<StoredGroupMessage>(`message-${message.messageId}`, message, {
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
    const { messageId, clientMessageId } = this.#messages[endIndex]

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
      await this.#storage.put<StoredGroupMessage>(`message-${message.messageId}`, message, {
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
    this.group = {
      chatId: id,
      lastMessageId: 0,
      photoUrl: imgUrl,
      type: 'group',
      name,
      missed: 0,
      meta: {
        name,
        createdAt: Date.now(),
        participants: await this.fetchUsers(participants),
        owner,
      },
    }

    
    this.#id = id
    await this.#storage.put('users', this.#users)
    await this.#storage.put<Group>(`meta`, this.group)
    await this.initialize()

    await this.broadcastEvent('newChat', this.group, owner)

    return newChat
  }

  private async broadcastEvent(
    type: InternalEventType,
    event: InternalEvent,
    sender: UserId,
    exclude?: UserId,
  ) {
    await this.#storage.deleteAlarm()
    for (const receiver of this.#users.map((user) => user.id)) {
      if (exclude === receiver) continue
      this.#outgoingEvets.push({
        event,
        sender: this.#users.find(u => u.id === sender)!,
        receiver,
        type,
        timestamp: this.timestamp(),
      })
    }
    await this.#storage.deleteAlarm()
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
