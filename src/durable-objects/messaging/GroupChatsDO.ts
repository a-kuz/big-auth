import { DurableObject } from 'cloudflare:workers'
import { Group } from '~/types/Chat'
import { GroupChatMessage } from '~/types/ChatMessage'
import { GetMessagesRequest } from '~/types/ws/client-requests'
import { InternalEvent, InternalEventType, NewGroupMessageEvent } from '~/types/ws/internal'
import { ChatsEvent, NewMessageEvent, ServerEvent } from '~/types/ws/server-events'
import { Env } from '../../types/Env'
import { DEFAULT_PORTION, MAX_PORTION } from './constants'

export class GroupChatsDO extends DurableObject {
  #timestamp = Date.now()
  #messages: GroupChatMessage[] = []
  chat!: Group
  #id: string = ''
  #counter = 0
  #lastRead = new Map<string, number>()
  constructor(
    ctx: DurableObjectState,
    public env: Env,
  ) {
    super(ctx, env)
    this.ctx.blockConcurrencyWhile(this.initialize)
  }

  // Initialize storage for group chats
  async initialize() {
    const meta = await this.ctx.storage.get<Group>('meta')
    if (!meta) {
      return
    }
    this.chat = meta
    this.#counter = (await this.ctx.storage.get<number>('counter')) || 0

    this.#messages = []
    for (let i = 0; i < this.#counter; i++) {
      const m = await this.ctx.storage.get<GroupChatMessage>(`message-${i}`)
      if (m) {
        this.#messages.push(m)
      }
    }

    const participants = Array.from(this.chat.meta.participants)
    for (let i = this.#counter - 1; i >= 0; i--) {
      const m = this.#messages[i]
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

  async fetch(request: Request) {
    const url = new URL(request.url)
    const paths = url.pathname
      .split('/')
      .filter(p => p)
      .slice(-2)

    const action = paths[1]

    switch (action) {
      case 'typing':
      // return this.friendTyping(request)
      case 'new':
        return this.newEventHandler(request)
      case 'messages':
        return this.getMessagesHandler(request)
      case 'dlvrd':
        return this.dlvrdEventHandler(request)
      case 'read':
        return this.readEventHandler(request)
      default:
        return new Response(`${url.pathname} Not found`, { status: 404 })
    }
  }

  async newEventHandler(request: Request) {
    const eventData = await request.json<NewGroupMessageEvent>()

    const timestamp = this.timestamp()

    return new Response(JSON.stringify(await this.newMessage(eventData)))
  }
  async getMessagesHandler(request: Request) {
    const data = await request.json<GetMessagesRequest>()

    return new Response(JSON.stringify(await this.getMessages(data)), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  async getMessages(payload: GetMessagesRequest): Promise<GroupChatMessage[]> {
    if (!this.#messages) return []
    const endIndex = payload.endId || this.#messages.length - 1
    const portion = payload.count ? Math.min(MAX_PORTION, payload.count) : DEFAULT_PORTION
    const startIndex = endIndex > portion ? endIndex - portion + 1 : 0
    const messages = this.#messages.slice(startIndex, endIndex + 1).filter(m => !!m)
    return messages
  }

  async dlvrdEventHandler(request: Request) {
    // const eventData = await request.json<MarkDeliveredInternalEvent>()

    // const chatId = eventData.chatId
    // const messages = (await this.ctx.storage.get<ChatMessage[]>(`messages-${chatId}`)) || []

    // const endId = messages.findLastIndex(m => m.createdAt === eventData.messageTimestamp)
    // if (endId === -1) {
    //   console.error('absolute fail')
    //   return errorResponse('fail')
    // }
    // const messageId = messages[endId].messageId
    // const event: MarkDeliveredEvent = { chatId, messageId, timestamp: eventData.timestamp }

    // for (let i = endId; i >= 0; i--) {
    //   const message = messages[i] as GroupChatMessage
    //   if (message.sender && message.sender !== this.userId) {
    //     continue
    //   }
    //   if (message.dlvrd) {
    //     break
    //   }
    //   message.dlvrd = eventData.timestamp
    // }
    // await this.ctx.storage.put<DialogMessage[]>(`messages-${chatId}`, messages)

    // if (messages[messages.length - 1].messageId === messageId) {
    //   const chats = (await this.ctx.storage.get<ChatList>('chatList')) || []
    //   const i = chats.findIndex(chat => chat.id === chatId)
    //   if (!chats[i].lastMessageStatus || chats[i].lastMessageStatus === 'undelivered') {
    //     chats[i].lastMessageStatus = 'unread'
    //   }
    //   await this.ctx.storage.put('chatList', chats)
    // }

    // if (this.onlineService.isOnline()) {
    //   await this.ws.sendEvent('dlvrd', event)
    // }
    return new Response()
  }

  async readEventHandler(request: Request) {
    // const eventData = await request.json<MarkReadInternalEvent>()

    // const chatId = eventData.chatId
    // const messages = (await this.ctx.storage.get<ChatMessage[]>(`messages-${chatId}`)) || []

    // const endId = messages.findLastIndex(m => m.createdAt === eventData.messageTimestamp)
    // if (endId === -1) {
    //   console.error('absolute fail')
    //   return errorResponse('fail')
    // }
    // const messageId = messages[endId].messageId
    // const event: MarkReadEvent = { chatId, messageId, timestamp: eventData.timestamp }

    // for (let i = endId; i >= 0; i--) {
    //   const message = messages[i] as DialogMessage
    //   if (message.sender && message.sender !== this.userId) {
    //     continue
    //   }
    //   if (message.read) {
    //     break
    //   }
    //   if (!message.read) {
    //     message.read = eventData.timestamp
    //   }
    //   if (!message.dlvrd) {
    //     message.dlvrd = eventData.timestamp
    //   }
    // }
    // await this.ctx.storage.put<DialogMessage[]>(`messages-${chatId}`, messages)

    // if (messages[messages.length - 1].messageId === messageId) {
    //   const chats = (await this.ctx.storage.get<ChatList>('chatList')) || []
    //   const i = chats.findIndex(chat => chat.id === chatId)
    //   if (!chats[i].lastMessageStatus || chats[i].lastMessageStatus === 'undelivered') {
    //     chats[i].lastMessageStatus = 'read'
    //   }
    //   await this.ctx.storage.put('chatList', chats)
    // }

    // if (this.onlineService.isOnline()) {
    //   await this.ws.sendEvent('read', event)
    // }
    return new Response()
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

    await this.ctx.storage.put<Group>(`meta`, newChat)
    await this.initialize()

    return newChat
  }

  async newMessage(eventData: NewGroupMessageEvent) {
    const timestamp = this.timestamp()

    const messageId = this.#messages.length + 1

    const message: GroupChatMessage = {
      createdAt: timestamp,
      messageId,
      sender: eventData.sender!,
      message: eventData.message,
      attachments: eventData.attachments,
      delivering: [],
      clientMessageId: eventData.clientMessageId,
    }
    this.#messages.push(message)
    this.#messages.sort((a, b) => a.createdAt - b.createdAt)

    const event: NewGroupMessageEvent = {
      chatId: this.chat.chatId,
      message: message.message,
      attachments: message.attachments,
      type: 'group',
      sender: message.sender,
      clientMessageId: eventData.clientMessageId,
    }
    await this.broadcastEvent('new', event)
    this.ctx.blockConcurrencyWhile(() =>
      this.ctx.storage.put<GroupChatMessage[]>(`messages`, this.#messages),
    )

    return { messageId, timestamp }
  }

  async broadcast(event: NewMessageEvent | ChatsEvent) {
    for (const user of this.chat!.meta.participants) {
      const receiverDOId = this.env.USER_MESSAGING_DO.idFromName(user)
      const receiverDO = this.env.USER_MESSAGING_DO.get(receiverDOId)

      // Create an event object with message details and timestamp

      const reqBody = JSON.stringify(event)
      const headers = new Headers({ 'Content-Type': 'application/json' })

      const resp = await receiverDO.fetch(
        new Request(`${this.env.ORIGIN}/${user}/group/event/new`, {
          method: 'POST',
          body: reqBody,
          headers,
        }),
      )
      if (resp.status !== 200) {
        throw new Error(await resp.text())
      }
    }
  }

  async broadcastEvent(type: InternalEventType, payload: InternalEvent) {
    for (const user of this.chat!.meta.participants) {
      const receiverDOId = this.env.USER_MESSAGING_DO.idFromName(user)
      const receiverDO = this.env.USER_MESSAGING_DO.get(receiverDOId)

      // Create an event object with message details and timestamp

      const vent: ServerEvent = { eventType: type, payload, timestamp: Date.now(), type: 'event' }
      const reqBody = JSON.stringify({ event: payload })
      const headers = new Headers({ 'Content-Type': 'application/json' })

      const resp = await receiverDO.fetch(
        new Request(`${this.env.ORIGIN}/${user}/group/event/${type}`, {
          method: 'POST',
          body: reqBody,
          headers,
        }),
      )
      if (resp.status !== 200) {
        throw new Error(await resp.text())
      }
    }
  }
}
