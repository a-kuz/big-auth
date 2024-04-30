import { ClientEventType, ClientRequestType } from '~/types/ws'
import {
  MarkDeliveredRequest,
  MarkReadRequest,
  NewMessageRequest,
  getChatsRequest,
  getMessagesRequest,
} from '~/types/ws/client-requests'
import { ChatMessage, DialogMessage } from '~/types/ws/messages'
import { ClientRequestPayload, ServerResponsePayload } from '~/types/ws/payload-types'
import {
  MarkDeliveredEvent,
  MarkReadEvent,
  NewMessageEvent,
  OfflineEvent,
  OnlineEvent,
} from '~/types/ws/server-events'
import { ChatList, ChatListItem } from '../../types/ChatList'
import { Env } from '../../types/Env'

import { MarkDeliveredInternalEvent, MarkReadInternalEvent } from '~/types/ws/internal'
import { errorResponse } from '~/utils/error-response'
import { newId } from '../../utils/new-id'
import { OnlineStatusService } from './OnlineStatusService'
import { WebSocketGod } from './WebSocketService'
import { dialogNameAndAvatar } from './utils/dialog-name-and-avatar'
import { toTop } from './utils/move-chat-to-top'

export class UserMessagingDO implements DurableObject {
  id = newId(3)
  private readonly ws: WebSocketGod
  private readonly onlineService: OnlineStatusService
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    this.ws = new WebSocketGod(state, env)
    this.onlineService = new OnlineStatusService(this.state, this.env, this.ws)
    this.ws.onlineService = this.onlineService
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
      case 'online':
        return this.friendOnline(request)
      case 'offline':
        return this.friendOffline(request)
      case 'send':
        return await this.newRequestHandler(request)
      case 'receive':
        return await this.newEventHandler(request)
      case 'edit':
        return this.editMessage(request)
      case 'chat':
        return this.fetchMessages(request)
      case 'chats':
        return this.fetchChats(request)
      case 'dlvrd':
        return this.dlvrdEventHandler(request)
      case 'read':
        return this.readEventHandler(request)
      default:
        return new Response(`${url.pathname} Not found`, { status: 404 })
    }
  }

  async newRequestHandler(request: Request) {
    const eventData = await request.json<NewMessageRequest>()
    const eventId = ((await this.state.storage.get<number>('eventIdCounter')) || 0) + 1
    const timestamp = Math.floor(Date.now() / 1000)

    await this.state.storage.put(`event-${eventId}`, eventData)
    await this.state.storage.put('eventIdCounter', eventId)

    if (eventData.chatId === this.userId) {
      return this.sendToFavorites(eventId, eventData, timestamp)
    } else {
      const response = new Response(JSON.stringify(await this.newRequest(eventData, timestamp)))

      return response
    }
  }

  async newEventHandler(request: Request) {
    const eventData = await request.json<NewMessageEvent>()
    console.log({ eventData })
    const eventId = ((await this.state.storage.get<number>('eventIdCounter')) || 0) + 1
    const timestamp = Math.floor(Date.now() / 1000)

    await this.state.storage.put(`event-${eventId}`, eventData)
    await this.state.storage.put('eventIdCounter', eventId)

    if (eventData.chatId === this.userId) {
      return this.sendToFavorites(eventId, eventData, timestamp)
    } else {
      return new Response(JSON.stringify(await this.receiveMessage(eventId, eventData)))
    }
  }
  async dlvrdEventHandler(request: Request) {
    const eventData = await request.json<MarkDeliveredInternalEvent>()
    const eventId = ((await this.state.storage.get<number>('eventIdCounter')) || 0) + 1

    await this.state.storage.put('eventIdCounter', eventId)

    const chatId = eventData.chatId
    const messages = (await this.state.storage.get<ChatMessage[]>(`messages-${chatId}`)) || []

    const endId = messages.findLastIndex(m => m.createdAt === eventData.messageTimestamp)
    if (endId === -1) {
      console.error('absolute fail')
      return errorResponse('fail')
    }
    const messageId = messages[endId].messageId
    const event: MarkDeliveredEvent = { chatId, messageId, timestamp: eventData.timestamp }
    await this.state.storage.put(`event-${eventId}`, event)
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
      await this.ws.sendEvent('dlvrd', eventId, event)
    }
    return new Response()
  }

  async readEventHandler(request: Request) {
    const eventData = await request.json<MarkReadInternalEvent>()
    const eventId = ((await this.state.storage.get<number>('eventIdCounter')) || 0) + 1

    await this.state.storage.put('eventIdCounter', eventId)

    const chatId = eventData.chatId
    const messages = (await this.state.storage.get<ChatMessage[]>(`messages-${chatId}`)) || []

    const endId = messages.findLastIndex(m => m.createdAt === eventData.messageTimestamp)
    if (endId === -1) {
      console.error('absolute fail')
      return errorResponse('fail')
    }
    const messageId = messages[endId].messageId
    const event: MarkReadEvent = { chatId, messageId, timestamp: eventData.timestamp }
    await this.state.storage.put(`event-${eventId}`, event)
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
      await this.ws.sendEvent('read', eventId, event)
    }
    return new Response()
  }

  async sendToFavorites(eventId: number, eventData: NewMessageRequest, timestamp: number) {
    const chatId = this.userId
    const [chats, chat] = toTop(
      (await this.state.storage.get<ChatList>('chatList')) || [],
      chatId,
      {
        id: chatId,
        lastMessageStatus: 'read',
        lastMessageText: eventData.message,
        lastMessageTime: timestamp,
        name: 'Favorites',
        type: 'favorites',
        verified: false,
        lastMessageAuthor: chatId,
        isMine: true,
      },
    )
    chat.missed = 0
    chats.unshift(chat)
    await this.state.storage.put('chatList', chats)

    return new Response(JSON.stringify({ success: true, eventId }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  async receiveMessage(eventId: number, eventData: NewMessageEvent) {
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
    const [chats, chat] = toTop(
      (await this.state.storage.get<ChatList>('chatList')) || [],
      chatId,
      chatChanges,
    )
    chat.missed = (chat.missed ?? 0) + 1
    chats.unshift(chat)
    await this.state.storage.put('chatList', chats)

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
      await this.ws.sendEvent('new', eventId, eventData)
    }
    return { success: true, eventId, dlvrd }
  }

  async editMessage(request: Request) {
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  async fetchMessages(request: Request) {
    const url = new URL(request.url)
    const chatId = url.searchParams.get('chatId')
    if (!chatId) {
      return new Response('Chat ID is required', { status: 400 })
    }

    const messages = await this.state.storage.list({
      prefix: `chat-${chatId}-message-`,
    })
    const messagesArray = Array.from(messages.values())

    return new Response(JSON.stringify(messagesArray), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  async fetchChats(request: Request) {
    const chatList = (await this.state.storage.get<ChatList>('chatList')) || []
    return new Response(JSON.stringify(chatList), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  async friendOnline(request: Request) {
    const eventData = await request.json<OnlineEvent>()

    let on = false
    for (const ws of this.state.getWebSockets('user')) {
      ws?.send(JSON.stringify({ type: 'online', userId: eventData.userId }))
      on = true
    }
    return new Response(on ? 'online' : '')
  }

  async friendOffline(request: Request) {
    const eventData = await request.json<OfflineEvent>()

    for (const ws of this.state.getWebSockets('user')) {
      try {
        ws?.send(JSON.stringify({ type: 'offline', userId: eventData.userId }))
      } catch (e) {
        console.error(e)
      }
    }
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

  async handleEvent(type: ClientEventType, event?: any): Promise<void | Object> {
    const eventId = ((await this.state.storage.get<number>('eventIdCounter')) || 0) + 1
    event.timestamp = Math.round(Date.now() / 1000)

    await this.state.storage.put(`event-${eventId}`, event)
    await this.state.storage.put('eventIdCounter', eventId)
    switch (event.type) {
      case 'typing':
        return
    }
  }

  async handleRequest(
    type: ClientRequestType,
    request: ClientRequestPayload,
  ): Promise<void | Object> {
    const timestamp = Math.round(Date.now() / 1000)
    let response: ServerResponsePayload = {}
    console.log(type)
    switch (type) {
      case 'new':
        response = await this.newRequest(request as NewMessageRequest, timestamp)
        return response
      case 'getChats':
        response = await this.getChatsRequest(request as getChatsRequest)
        return response
      case 'getMessages':
        response = await this.getMessagesRequest(request as getMessagesRequest)
        return response
      case 'dlvrd':
        response = await this.dlvrdRequest(request as MarkDeliveredRequest, timestamp)
        return response
      case 'read':
        response = await this.readRequest(request as MarkReadRequest, timestamp)
        console.log(response)
        return response
    }
  }

  async getChatsRequest(payload: getChatsRequest): Promise<ChatList> {
    const chatList = (await this.state.storage.get<ChatList>('chatList')) || []
    return chatList
  }

  async getMessagesRequest(payload: getMessagesRequest): Promise<ChatMessage[]> {
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
    }

    const [chats, chat] = toTop(
      (await this.state.storage.get<ChatList>('chatList')) || [],
      chatId,
      chatChanges,
    )
    chats.unshift(chat)
    await this.state.storage.put('chatList', chats)
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
    return { messageId }
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

      if (!message.read) {
        message.read = timestamp
      }
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

  userId = ''
}
