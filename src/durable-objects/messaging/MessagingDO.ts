import { ChatMessage } from '~/types/ChatMessage'
import { ClientEventType, ClientRequestType, ServerEventType } from '~/types/ws'
import {
  GetChatsRequest,
  GetMessagesRequest,
  MarkDeliveredRequest,
  MarkReadRequest,
  NewMessageRequest,
  TypingClientEvent,
} from '~/types/ws/client-requests'
import {
  ClientEventPayload,
  ClientRequestPayload,
  ServerResponsePayload,
} from '~/types/ws/payload-types'
import {
  MarkDeliveredEvent,
  NewMessageEvent,
  OfflineEvent,
  OnlineEvent,
  TypingServerEvent,
} from '~/types/ws/server-events'
import { ChatList, ChatListItem } from '../../types/ChatList'
import { Env } from '../../types/Env'

import { displayName } from '~/services/display-name'
import { Dialog } from '~/types/Chat'
import {
  InternalEventType,
  MarkDeliveredInternalEvent,
  TypingInternalEvent,
} from '~/types/ws/internal'
import { OnlineStatusService } from './OnlineStatusService'
import { WebSocketGod } from './WebSocketService'

export class UserMessagingDO implements DurableObject {
  chatList: ChatList = []
  chatMessages: { [key: string]: ChatMessage[] } = {}
  chatsMeta: { [key: string]: { lastId?: number } } = {}
  #timestamp = Date.now()
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
      this.chatList = (await this.state.storage.get<ChatList>('chatList')) || []
    })
  }

  timestamp() {
    const current = performance.now()
    if (current > this.#timestamp) {
      this.#timestamp = current
      return current
    }
    this.#timestamp++
    return this.#timestamp
  }

  async alarm(): Promise<void> {
    await this.ws.alarm()
  }

  async fetch(request: Request) {
    // */userId/internal|client/(event|request)/(request or event name); example: /EiuOGJcrQoY0LjL2-FbtG/internal/event/new', '/EiuOGJcrQoY0LjL2-FbtG/client/request/new''
    const url = new URL(request.url)
    const paths = url.pathname
      .split('/')
      .filter(p => p)
      .slice(-4)

    const [userId, from, type, action] = paths as [
      string,
      'dialog' | 'client' | 'group' | 'messaging',
      'event' | 'request' | 'connect',
      ClientEventType | ServerEventType | InternalEventType | ClientRequestType | 'websocket',
    ]
    this.setUserId(userId)

    switch (from) {
      case 'client':
        switch (type) {
          case 'connect':
            return this.handleWebsocket(request)
          case 'request':
            switch (action) {
              case 'chats':
                return this.chatsHandler(request)
              case 'messages':
                return this.messagesHandler(request)
              case 'new':
                return this.newHandler(request)
            }
        }

      case 'dialog': {
        switch (action) {
          case 'new':
            return this.newEventHandler(request)
          case 'dlvrd':
            return this.dlvrdEventHandler(request)
          case 'read':
            return this.readEventHandler(request)
        }
      }
      case 'messaging': {
        switch (type) {
          case 'event':
            switch (action) {
              case 'online':
                return this.friendOnline(request)
              case 'offline':
                return this.friendOffline(request)
              case 'typing':
                return this.friendTyping(request)
            }
        }
      }
    }
    return new Response(`${url.pathname} Not found`, { status: 404 })
  }

  async newHandler(request: Request) {
    const eventData = await request.json<NewMessageRequest>()

    if (eventData.chatId === this.userId) {
      const timestamp = this.timestamp()
      return this.sendToFavorites(eventData, timestamp)
    } else {
      const response = new Response(JSON.stringify(await this.newRequest(eventData)))

      return response
    }
  }

  async newEventHandler(request: Request) {
    const eventData = await request.json<NewMessageEvent>()

    return new Response(JSON.stringify(await this.receiveMessage(eventData)))
  }

  async dlvrdEventHandler(request: Request) {
    const eventData = await request.json<MarkDeliveredInternalEvent>()

    const chatId = eventData.chatId

    const counter = await this.dialogStorage(chatId).counter()

    if (counter - 1 === eventData.messageId) {
      const i = this.chatList.findIndex(chat => chat.id === chatId)
      if (
        !this.chatList[i].lastMessageStatus ||
        this.chatList[i].lastMessageStatus === 'undelivered'
      ) {
        this.chatList[i].lastMessageStatus = 'unread'
      }
      await this.state.storage.put('chatList', this.chatList)
    }

    if (this.onlineService.isOnline()) {
      const event: MarkDeliveredEvent = {
        chatId,
        messageId: eventData.messageId,
        timestamp: eventData.timestamp,
      }
      await this.ws.sendEvent('dlvrd', event)
    }
    return new Response()
  }

  async readEventHandler(request: Request) {
    const eventData = await request.json<MarkDeliveredInternalEvent>()

    const chatId = eventData.chatId

    const counter = await this.dialogStorage(chatId).counter()

    if (counter - 1 === eventData.messageId) {
      const i = this.chatList.findIndex(chat => chat.id === chatId)
      if (
        !this.chatList[i].lastMessageStatus ||
        this.chatList[i].lastMessageStatus === 'undelivered' ||
        this.chatList[i].lastMessageStatus === 'unread'
      ) {
        this.chatList[i].lastMessageStatus = 'read'
      }
      await this.state.storage.put('chatList', this.chatList)
    }

    if (this.onlineService.isOnline()) {
      const event: MarkDeliveredEvent = {
        chatId,
        messageId: eventData.messageId,
        timestamp: eventData.timestamp,
      }
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
    this.chatList.unshift(chat)
    await this.state.storage.put('chatList', this.chatList)

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  async receiveMessage(eventData: NewMessageEvent) {
    const chatId = eventData.chatId
    const dialog: Dialog = await this.dialogStorage(chatId).chat(this.userId)
    const chatIndex = this.chatList.findIndex(ch => ch.id === chatId)
    let isNew = chatIndex === -1
    const counter = await this.dialogStorage(chatId).counter()

    if (isNew || counter - 1 <= eventData.messageId) {
      const chatChanges: Partial<ChatListItem> = {
        id: chatId,
        lastMessageStatus: 'undelivered',
        lastMessageText: dialog.lastMessageText,
        lastMessageTime: dialog.lastMessageTime,
        name: dialog.name,
        type: 'dialog',
        verified: false,
        lastMessageAuthor: dialog.lastMessageAuthor,
        photoUrl: dialog.photoUrl,
        isMine: dialog.isMine,
        lastMessageId: dialog.lastMessageId,
        missed: dialog.missed,
      }
      const chat = this.toTop(chatId, chatChanges)

      this.chatList.unshift(chat)
      await this.state.storage.put('chatList', this.chatList)
    }

    let dlvrd = false
    if (this.onlineService.isOnline()) {
      if (isNew) {
        await this.ws.sendEvent('chats', this.chatList)
      }
      await this.ws.sendEvent('new', { ...eventData, sender: eventData.chatId })
      dlvrd = true
    }
    return { success: true, dlvrd }
  }

  async chatsHandler(request: Request) {
    const chatList = this.chatList
    return new Response(JSON.stringify(chatList), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  async messagesHandler(request: Request) {
    const data = await request.json<GetMessagesRequest>()
    const dialog = this.dialogStorage(data.chatId)
    const messages = await dialog.getMessages(data)

    return new Response(JSON.stringify(messages), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  private dialogStorage(chatId: string) {
    const id = this.env.DIALOG_DO.idFromName(
      [chatId, this.userId].sort((a, b) => (a > b ? 1 : -1)).join(':'),
    )
    const dialog = this.env.DIALOG_DO.get(id)
    return dialog
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
    console.log('wsRequest: ', { type, request })

    switch (type) {
      case 'new':
        response = await this.newRequest(request as NewMessageRequest)
        return response
      case 'dlvrd':
        return this.state.blockConcurrencyWhile(() =>
          this.dlvrdRequest(request as MarkDeliveredRequest, this.timestamp()),
        )

      case 'read':
        response = await this.readRequest(request as MarkReadRequest, this.timestamp())
        return response
      case 'chats':
        response = await this.getChatsRequest(request as GetChatsRequest)
        return response

      case 'messages':
        response = await this.getMessagesRequest(request as GetMessagesRequest)
        return response
    }
  }

  async getChatsRequest(payload: GetChatsRequest): Promise<ChatList> {
    return this.chatList.filter(chat => chat.id !== this.userId)
  }

  async getMessagesRequest(payload: GetMessagesRequest): Promise<ChatMessage[]> {
    return this.dialogStorage(payload.chatId).getMessages(payload)
  }

  async newRequest(payload: NewMessageRequest) {
    const chatId = payload.chatId
    if (chatId === this.userId) {
      return this.sendToFavorites(payload, this.timestamp())
    }
    const dialogStorage = this.dialogStorage(chatId)
    if (!this.chatList.find(chat => chat.id === chatId)) {
      await this.state.blockConcurrencyWhile(async () => dialogStorage.create(this.userId, chatId))
    }

    const { messageId, timestamp, clientMessageId } = await dialogStorage.newMessage(
      this.userId,
      payload,
    )

    const dialog: Dialog = await dialogStorage.chat(this.userId)
    const chatChanges: Partial<ChatListItem> = {
      id: chatId,
      lastMessageStatus: 'undelivered',
      lastMessageText: payload.message,
      lastMessageTime: timestamp,
      missed: 0,
      name: dialog.name,
      type: 'dialog',
      verified: false,
      lastMessageAuthor: '',
      photoUrl: dialog.photoUrl,
      isMine: true,
      lastMessageId: messageId,
      ...(payload.attachments?.length ? { attachmentType: payload.attachments[0].type } : {}),
    }

    const chat = this.toTop(chatId, chatChanges)
    this.chatList.unshift(chat)

    await this.state.storage.put('chatList', this.chatList)
    return { messageId, timestamp, clientMessageId }
  }

  toTop(chatId: string, eventData: Partial<ChatListItem>): ChatListItem {
    const currentChatIndex = this.chatList.findIndex(chat => chat.id === chatId)
    const currentChat: ChatListItem =
      currentChatIndex === -1
        ? (eventData as ChatListItem)
        : { ...this.chatList[currentChatIndex], ...eventData }
    if (currentChatIndex >= 0) this.chatList.splice(currentChatIndex, 1)

    return currentChat
  }

  async dlvrdRequest(payload: MarkDeliveredRequest, timestamp: number) {
    const chatId = payload.chatId

    return this.dialogStorage(chatId).dlvrd(this.userId, payload, timestamp)
  }

  async readRequest(payload: MarkReadRequest, timestamp: number) {
    const chatId = payload.chatId

    const resp = await this.dialogStorage(chatId).read(this.userId, payload, timestamp)
    const i = this.chatList.findIndex(chat => chat.id === chatId)
    this.chatList[i].missed = resp.missed
    await this.state.storage.put('chatList', this.chatList)
    return resp
  }

  async typingEvent(event: TypingClientEvent) {
    const receiverDOId = this.env.USER_MESSAGING_DO.idFromName(event.chatId)
    const receiverDO = this.env.USER_MESSAGING_DO.get(receiverDOId)

    await receiverDO.fetch(
      new Request(`${this.env.ORIGIN}/${event.chatId}/messaging/event/typing`, {
        method: 'POST',
        body: JSON.stringify({ userId: this.userId } as TypingInternalEvent),
      }),
    )
  }

  userId = ''
  setUserId(id: string) {
    this.userId = id
    this.onlineService.setUserId(id)
  }
}
