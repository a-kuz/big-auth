import { ClientEventType, ClientRequestType } from '~/types/ws'
import {
  MarkDeliveredRequest,
  MarkReadRequest,
  NewMessageRequest,
  TypingClientEvent,
  GetChatsRequest,
  GetMessagesRequest,
} from '~/types/ws/client-requests'
import { ChatMessage, DialogMessage } from '~/types/ws/messages'
import {
  ClientEventPayload,
  ClientRequestPayload,
  ServerResponsePayload,
} from '~/types/ws/payload-types'
import {
  MarkDeliveredEvent,
  MarkReadEvent,
  NewMessageEvent,
  OfflineEvent,
  OnlineEvent,
  TypingServerEvent,
} from '~/types/ws/server-events'
import { ChatList, ChatListItem } from '../../types/ChatList'
import { Env } from '../../types/Env'

import {
  MarkDeliveredInternalEvent,
  MarkReadInternalEvent,
  TypingInternalEvent,
} from '~/types/ws/internal'
import { errorResponse } from '~/utils/error-response'
import { newId } from '../../utils/new-id'
import { OnlineStatusService } from './OnlineStatusService'
import { WebSocketGod } from './WebSocketService'
import { dialogNameAndAvatar } from './utils/dialog-name-and-avatar'

export class UserMessagingDO implements DurableObject {
  id = newId(3)
  chats: ChatList = []
  #timestamp = Math.floor(Date.now() / 1000)
  private readonly ws: WebSocketGod
  private readonly onlineService: OnlineStatusService
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    this.ws = new WebSocketGod(state, env)
    this.onlineService = new OnlineStatusService(this.state, this.env, this.ws)
    this.ws.onlineService = this.onlineService
    this.state.blockConcurrencyWhile(async () => {
      this.chats = (await this.state.storage.get<ChatList>('chatList')) || []
    })
  }

  timestamp() {
    const current = Math.floor(performance.now() / 1000)
    if (current > this.#timestamp) {
      this.#timestamp = current
      return current
    }
    this.#timestamp++
    return this.#timestamp
  }

  async alarm(): Promise<void> {
    this.ws.alarm()
  }

  async fetch(request: Request) {
    const url = new URL(request.url)
    const paths = url.pathname
      .split('/')
      .filter(p => p)
      .slice(-2)
    this.userId = paths[0]
    this.onlineService.setUserId(this.userId)
    const action = paths[1]

    switch (action) {
      case 'websocket':
        return this.handleWebsocket(request)
      case 'are-you-online':
        return this.friendOnline(request)
      case 'i-am-offline':
        return this.friendOffline(request)
      case 'typing':
        return this.friendTyping(request)
      case 'send':
        return this.newHttpRequestHandler(request)
      case 'receive':
        return this.newEventHandler(request)
      case 'chats':
        return this.chatsHandler(request)
      case 'getMessages':
        return this.getMessagesHandler(request)
      case 'dlvrd':
        return this.dlvrdEventHandler(request)
      case 'read':
        return this.readEventHandler(request)
      default:
        return new Response(`${url.pathname} Not found`, { status: 404 })
    }
  }

  async newHttpRequestHandler(request: Request) {
    const eventData = await request.json<NewMessageRequest>()

    const timestamp = this.timestamp()

    if (eventData.chatId === this.userId) {
      return this.sendToFavorites(eventData, timestamp)
    } else {
      const response = new Response(JSON.stringify(await this.newRequest(eventData, timestamp)))

      return response
    }
  }

  async newEventHandler(request: Request) {
    const eventData = await request.json<NewMessageEvent>()

    const timestamp = this.timestamp()

    if (eventData.chatId === this.userId) {
      return this.sendToFavorites(eventData, timestamp)
    } else {
      return new Response(JSON.stringify(await this.receiveMessage(eventData)))
    }
  }
  async dlvrdEventHandler(request: Request) {
    const eventData = await request.json<MarkDeliveredInternalEvent>()

    const chatId = eventData.chatId
    const messages = (await this.state.storage.get<ChatMessage[]>(`messages-${chatId}`)) || []

    const endId = messages.findLastIndex(m => m.createdAt === eventData.messageTimestamp)
    if (endId === -1) {
      console.error('absolute fail')
      return errorResponse('fail')
    }
    const messageId = messages[endId].messageId
    const event: MarkDeliveredEvent = { chatId, messageId, timestamp: eventData.timestamp }

    for (let i = endId; i >= 0; i--) {
      const message = messages[i] as DialogMessage
      if (message.sender && message.sender !== this.userId) {
        continue
      }
      if (message.dlvrd) {
        break
      }
      message.dlvrd = eventData.timestamp
    }
    await this.state.storage.put<DialogMessage[]>(`messages-${chatId}`, messages)

    if (messages[messages.length - 1].messageId === messageId) {
      const chats = (await this.state.storage.get<ChatList>('chatList')) || []
      const i = chats.findIndex(chat => chat.id === chatId)
      if (!chats[i].lastMessageStatus || chats[i].lastMessageStatus === 'undelivered') {
        chats[i].lastMessageStatus = 'unread'
      }
      await this.state.storage.put('chatList', chats)
    }

    if (this.onlineService.isOnline()) {
      await this.ws.sendEvent('dlvrd', event)
    }
    return new Response()
  }

  async readEventHandler(request: Request) {
    const eventData = await request.json<MarkReadInternalEvent>()

    const chatId = eventData.chatId
    const messages = (await this.state.storage.get<ChatMessage[]>(`messages-${chatId}`)) || []

    const endId = messages.findLastIndex(m => m.createdAt === eventData.messageTimestamp)
    if (endId === -1) {
      console.error('absolute fail')
      return errorResponse('fail')
    }
    const messageId = messages[endId].messageId
    const event: MarkReadEvent = { chatId, messageId, timestamp: eventData.timestamp }

    for (let i = endId; i >= 0; i--) {
      const message = messages[i] as DialogMessage
      if (message.sender && message.sender !== this.userId) {
        continue
      }
      if (message.read) {
        break
      }
      if (!message.read) {
        message.read = eventData.timestamp
      }
      if (!message.dlvrd) {
        message.dlvrd = eventData.timestamp
      }
    }
    await this.state.storage.put<DialogMessage[]>(`messages-${chatId}`, messages)

    if (messages[messages.length - 1].messageId === messageId) {
      const chats = (await this.state.storage.get<ChatList>('chatList')) || []
      const i = chats.findIndex(chat => chat.id === chatId)
      if (!chats[i].lastMessageStatus || chats[i].lastMessageStatus === 'undelivered') {
        chats[i].lastMessageStatus = 'read'
      }
      await this.state.storage.put('chatList', chats)
    }

    if (this.onlineService.isOnline()) {
      await this.ws.sendEvent('read', event)
    }
    return new Response()
  }

  async sendToFavorites(eventData: NewMessageRequest, timestamp: number) {
    const chatId = this.userId
    const chat = this.toTop(chatId, {
      id: chatId,
      lastMessageStatus: 'read',
      lastMessageText: eventData.message,
      lastMessageTime: timestamp,
      name: 'Favorites',
      type: 'favorites',
      verified: false,
      lastMessageAuthor: chatId,
      isMine: true,
    })
    chat.missed = 0
    this.chats.unshift(chat)
    await this.state.storage.put('chatList', this.chats)

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  async receiveMessage(eventData: NewMessageEvent) {
    const chatId = eventData.chatId
    const dialog = await dialogNameAndAvatar(chatId, this.env.DB)
    const messages = (await this.state.storage.get<ChatMessage[]>(`messages-${chatId}`)) || []
    const messageId = messages.length + 1
    const chatChanges: Partial<ChatListItem> = {
      id: chatId,
      lastMessageStatus: 'undelivered',
      lastMessageText: eventData.message,
      lastMessageTime: eventData.timestamp,
      name: dialog[0],
      type: 'dialog',
      verified: false,
      lastMessageAuthor: dialog[0],
      photoUrl: dialog[1],
      isMine: false,
      lastMessageId: messageId,
    }
    const chat = this.toTop(chatId, chatChanges)
    chat.missed = (chat.missed ?? 0) + 1
    this.chats.unshift(chat)
    await this.state.storage.put('chatList', this.chats)

    const message: DialogMessage = {
      createdAt: eventData.timestamp!,
      messageId,
      sender: eventData.chatId,
      message: eventData.message,
      attachments: eventData.attachments,
    }

    messages.push(message)
    messages.sort((a, b) => a.createdAt - b.createdAt)
    await this.state.storage.put<DialogMessage[]>(`messages-${chatId}`, messages)

    let dlvrd = false
    if (this.onlineService.isOnline()) {
      await this.ws.sendEvent('new', eventData)
    }
    return { success: true, dlvrd }
  }

  async chatsHandler(request: Request) {
    const chatList = this.chats
    return new Response(JSON.stringify(chatList), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  async getMessagesHandler(request: Request) {
		const data = await request.json<GetMessagesRequest>()
		const messages = await this.state.storage.get<DialogMessage[]>(`messages-${data.chatId}`) || []

    return new Response(JSON.stringify(messages), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  async friendOnline(request: Request) {
    const eventData = await request.json<OnlineEvent>()

    return new Response(
      (await this.ws.sendEvent('online', { userId: eventData.userId })) ? 'online' : '',
    )
  }

  async friendOffline(request: Request) {
    const eventData = await request.json<OfflineEvent>()
    this.ws.sendEvent('offline', { userId: eventData.userId })
    return new Response()
  }

  async friendTyping(request: Request) {
    const eventData = await request.json<TypingInternalEvent>()
    const event: TypingServerEvent = { chatId: eventData.userId }
    this.ws.sendEvent('typing', event)
    return new Response()
  }

  ////////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////////

  private async handleWebsocket(request: Request): Promise<Response> {
    const response = await this.ws.acceptWebSocket(request)
    this.state.waitUntil(this.onlineService.online())
    return response
  }
  ////////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////////

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.ws.handlePacket(ws, message, this)
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ): Promise<void> {
    await this.ws.handleClose(ws, code, reason, wasClean)
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    await this.ws.handleError(ws, error)
  }

  ////////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////////

  async wsEvent(type: ClientEventType, event?: ClientEventPayload): Promise<void | Object> {
    switch (type) {
      case 'typing':
        return this.typingEvent(event! as TypingClientEvent)
      case 'offline':
        return this.onlineService.offline()
    }
  }

  async wsRequest(type: ClientRequestType, request: ClientRequestPayload): Promise<void | Object> {
    let response: ServerResponsePayload = {}
    return this.state.blockConcurrencyWhile(async () => {
      switch (type) {
        case 'new':
          const timestamp = this.timestamp()
          response = await this.newRequest(request as NewMessageRequest, timestamp)
          return response
        case 'getChats':
          response = await this.getChatsRequest(request as GetChatsRequest)
          return response
        case 'getMessages':
          return response
        case 'dlvrd':
          response = await this.dlvrdRequest(request as MarkDeliveredRequest, this.timestamp())
          return response
        case 'read':
          response = await this.readRequest(request as MarkReadRequest, this.timestamp())
          return response
      }
    })
  }

  async getChatsRequest(payload: GetChatsRequest): Promise<ChatList> {
    return this.chats
  }

  async getMessagesRequest(payload: GetMessagesRequest): Promise<ChatMessage[]> {
    const messages =
      (await this.state.storage.get<ChatMessage[]>(`messages-${payload.chatId}`)) || []
    return messages
  }

  async newRequest(payload: NewMessageRequest, timestamp: number) {
    const chatId = payload.chatId
    const messages = (await this.state.storage.get<ChatMessage[]>(`messages-${chatId}`)) || []
    const messageId = messages.length + 1
    const dialog = await dialogNameAndAvatar(chatId, this.env.DB)
    const chatChanges: Partial<ChatListItem> = {
      id: chatId,
      lastMessageStatus: 'undelivered',
      lastMessageText: payload.message,
      lastMessageTime: timestamp,
      missed: 0,
      name: dialog[0],
      type: 'dialog',
      verified: false,
      lastMessageAuthor: '',
      photoUrl: dialog[1],
      isMine: true,
      lastMessageId: messageId,
      ...(payload.attachments?.length ? { attachmentType: payload.attachments[0].type } : {}),
    }

    const chat = this.toTop(chatId, chatChanges)
    this.chats.unshift(chat)
    await this.state.storage.put('chatList', this.chats)
    const message: DialogMessage = {
      createdAt: timestamp,
      messageId,
      sender: this.userId,
      message: payload.message,
      attachments: payload.attachments,
    }

    messages.push(message)
    messages.sort((a, b) => a.createdAt - b.createdAt)
    await this.sendNewEventFromRequest(chatId, message, timestamp)

    await this.state.storage.put<DialogMessage[]>(`messages-${chatId}`, messages)
    return { messageId, timestamp }
  }
  toTop(chatId: string, eventData: Partial<ChatListItem>): ChatListItem {
    const currentChatIndex = this.chats.findIndex(chat => chat.id === chatId)
    const currentChat: ChatListItem =
      currentChatIndex === -1
        ? (eventData as ChatListItem)
        : { ...this.chats[currentChatIndex], ...eventData }
    if (currentChatIndex >= 0) this.chats.splice(currentChatIndex, 1)

    return currentChat
  }

  async dlvrdRequest(payload: MarkDeliveredRequest, timestamp: number) {
    const chatId = payload.chatId
    const messages = (await this.state.storage.get<ChatMessage[]>(`messages-${chatId}`)) || []

    if (!messages.length) {
      throw new Error('Chat is empty')
    }
    let endIndex = messages.length - 1

    if (payload.messageId) {
      endIndex = messages.findLastIndex(m => m.messageId === payload.messageId)

      if (endIndex === -1) {
        throw new Error(`messageId is not exists`)
      }
    }

    for (let i = endIndex; i >= 0; i--) {
      const message = messages[i] as DialogMessage
      if (!message.sender || message.sender === this.userId) {
        continue
      }
      if (message.dlvrd) {
        break
      }
      message.dlvrd = timestamp
    }

    await this.sendDlvrdEventFromRequest(chatId, messages[endIndex].createdAt, timestamp)

    await this.state.storage.put<DialogMessage[]>(`messages-${chatId}`, messages)

    return { messageId: messages[endIndex].messageId, timestamp }
  }

  async readRequest(payload: MarkReadRequest, timestamp: number) {
    const chatId = payload.chatId
    const messages = (await this.state.storage.get<ChatMessage[]>(`messages-${chatId}`)) || []

    if (!messages.length) {
      throw new Error('Chat is empty')
    }
    let endIndex = messages.length - 1

    if (payload.messageId) {
      endIndex = messages.findLastIndex(m => m.messageId === payload.messageId)

      if (endIndex === -1) {
        throw new Error(`messageId is not exists`)
      }
    }

    for (let i = endIndex; i >= 0; i--) {
      const message = messages[i] as DialogMessage
      if (!message.sender || message.sender === this.userId) {
        continue
      }
      if (message.read) {
        break
      }

      if (!message.dlvrd) {
        message.dlvrd = timestamp
      }

      message.read = timestamp
    }

    await this.sendReadEventFromRequest(chatId, messages[endIndex].createdAt, timestamp)

    await this.state.storage.put<DialogMessage[]>(`messages-${chatId}`, messages)

    return { messageId: messages[endIndex].messageId, timestamp }
  }

  async sendDlvrdEventFromRequest(receiverId: string, messageTimestamp: number, timestamp: number) {
    // Retrieve sender and receiver's durable object IDs

    const receiverDOId = this.env.USER_MESSAGING_DO.idFromName(receiverId)
    const receiverDO = this.env.USER_MESSAGING_DO.get(receiverDOId)

    // Create an event object with message details and timestamp
    const event: MarkDeliveredInternalEvent = {
      chatId: this.userId,
      messageTimestamp,
      timestamp,
    }

    const reqBody = JSON.stringify(event)
    const headers = new Headers({ 'Content-Type': 'application/json' })

    const resp = await receiverDO.fetch(
      new Request(`${this.env.ORIGIN}/${receiverId}/dlvrd`, {
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

  async sendReadEventFromRequest(receiverId: string, messageTimestamp: number, timestamp: number) {
    // Retrieve sender and receiver's durable object IDs

    const receiverDOId = this.env.USER_MESSAGING_DO.idFromName(receiverId)
    const receiverDO = this.env.USER_MESSAGING_DO.get(receiverDOId)

    // Create an event object with message details and timestamp
    const event: MarkReadInternalEvent = {
      chatId: this.userId,
      messageTimestamp,
      timestamp,
    }

    const reqBody = JSON.stringify(event)
    const headers = new Headers({ 'Content-Type': 'application/json' })

    const resp = await receiverDO.fetch(
      new Request(`${this.env.ORIGIN}/${receiverId}/read`, {
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

  async sendNewEventFromRequest(receiverId: string, message: DialogMessage, timestamp: number) {
    // Retrieve sender and receiver's durable object IDs

    const receiverDOId = this.env.USER_MESSAGING_DO.idFromName(receiverId)
    const receiverDO = this.env.USER_MESSAGING_DO.get(receiverDOId)

    // Create an event object with message details and timestamp
    const event: NewMessageEvent = {
      chatId: this.userId,
      message: message.message!,
      attachments: message.attachments,
      timestamp,
    }

    const reqBody = JSON.stringify(event)
    const headers = new Headers({ 'Content-Type': 'application/json' })

    const resp = await receiverDO.fetch(
      new Request(`${this.env.ORIGIN}/${receiverId}/receive`, {
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

  async typingEvent(event: TypingClientEvent) {
    const receiverDOId = this.env.USER_MESSAGING_DO.idFromName(event.chatId)
    const receiverDO = this.env.USER_MESSAGING_DO.get(receiverDOId)

    await receiverDO.fetch(
      new Request(`${this.env.ORIGIN}/${event.chatId}/typing`, {
        method: 'POST',
        body: JSON.stringify({ userId: this.userId } as TypingInternalEvent),
      }),
    )
  }

  userId = ''
}
