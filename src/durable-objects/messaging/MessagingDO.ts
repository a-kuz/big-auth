import { ChatMessage } from '~/types/ChatMessage'
import { ClientEventType, ClientRequestType, ServerEventType } from '~/types/ws'
import {
  GetChatRequest,
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
  MarkReadEvent,
  NewMessageEvent,
  OfflineEvent,
  OnlineEvent,
  TypingServerEvent,
} from '~/types/ws/server-events'
import { ChatList, ChatListItem } from '../../types/ChatList'
import { Env } from '../../types/Env'

import { Dialog, DialogAI, Group } from '~/types/Chat'
import { PushNotification } from '~/types/queue/PushNotification'
import {
  InternalEventType,
  MarkDeliveredInternalEvent,
  MarkReadInternalEvent,
  NewChatEvent,
  NewGroupMessageEvent,
  TypingInternalEvent,
} from '~/types/ws/internal'
import { MarkReadResponse } from '~/types/ws/responses'
import { DialogsDO } from './DialogsDO'
import { OnlineStatusService } from './OnlineStatusService'
import { WebSocketGod } from './WebSocketService'
import { chatStorage, gptStorage, isGroup, pushStorage, userStorage } from './utils/mdo'

export class UserMessagingDO implements DurableObject {
  readonly ['__DURABLE_OBJECT_BRAND']!: never
  #chatList: ChatList = []
  #timestamp = Date.now()
  #deviceToken = ''
  #fingerprint = ''
  #chatListTimer: NodeJS.Timeout | undefined
  private readonly wsService: WebSocketGod
  private readonly onlineService: OnlineStatusService
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    this.wsService = new WebSocketGod(state, env)
    this.onlineService = new OnlineStatusService(this.state, this.env, this.wsService)
    this.wsService.onlineService = this.onlineService
    this.state.blockConcurrencyWhile(async () => {
      this.#chatList = (await this.state.storage.get<ChatList>('chatList')) || []
      this.#fingerprint = (await this.state.storage.get<string>('fingerprint')) || ''
      this.#deviceToken = (await this.state.storage.get<string>('deviceToken')) || ''
    })
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

  async alarm(): Promise<void> {
    await this.wsService.alarm()
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
      (
        | ClientEventType
        | ServerEventType
        | InternalEventType
        | ClientRequestType
        | 'websocket'
        | 'setDeviceToken'
      ),
    ]
    if (!this.#userId) {
      this.#setUserId(userId)
      if (action !== 'setDeviceToken') {
        this.setDeviceToken()
      }
    }
    console.log({ from, type, action })

    switch (from) {

			case 'client':
        switch (type) {
          case 'connect':
            return this.handleWebsocket(request)
          case 'request':
            switch (action) {
              case 'chats':
                return this.chatsHandler(request)
              case 'chat':
                return this.chatHandler(request)
              case 'messages':
                return this.messagesHandler(request)
              case 'new':
                return this.newHandler(request)
              case 'setDeviceToken':
                return this.setDeviceTokenHandler(request)
            }
        }

      case 'group': {
        switch (action) {
          case 'newChat':
            return this.newChatEventHandler(request)
          case 'deleteChat':
            return this.newChatEventHandler(request)
          case 'new':
            return this.newEventHandler(request)
          case 'read':
            return this.readEventHandler(request)
          case 'dlvrd':
            return this.dlvrdEventHandler(request)
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

    if (eventData.chatId === this.#userId) {
      const timestamp = this.timestamp()
      return this.sendToFavorites(eventData, timestamp)
    } else {
      const response = new Response(JSON.stringify(await this.newRequest(eventData)))

      return response
    }
  }

  async newEventHandler(request: Request) {
    const eventData = await request.json<NewMessageEvent | NewGroupMessageEvent>()

    return new Response(JSON.stringify(await this.receiveMessage(eventData)))
  }
  async newChatEventHandler(request: Request) {
    const eventData = await request.json<NewChatEvent>()
    console.log(eventData)
    const { chatId, name, meta } = eventData
    const { owner } = meta
    const chat = this.toTop(chatId, {
      id: chatId,
      lastMessageStatus: 'undelivered',
      lastMessageText: 'chat created',
      lastMessageTime: this.timestamp(),
      name: name,
      type: 'group',
      verified: false,
      lastMessageAuthor: owner,
      isMine: owner === this.#userId,
    })
    chat.missed = 0
    this.#chatList.unshift(chat)
    this.save()
    if (this.onlineService.isOnline()) {
      await this.wsService.sendEvent('chats', this.#chatList)
    }

    return new Response()
  }

  async dlvrdEventHandler(request: Request) {
    const eventData = await request.json<MarkDeliveredInternalEvent>()

    const chatId = eventData.chatId

    const counter = await this.chatStorage(chatId).counter()

    if (counter - 1 === eventData.messageId) {
      const i = this.#chatList.findIndex(chat => chat.id === chatId)
      if (
        !this.#chatList[i].lastMessageStatus ||
        this.#chatList[i].lastMessageStatus === 'undelivered'
      ) {
        this.#chatList[i].lastMessageStatus = 'unread'
        this.save()
      }
    }

    if (this.onlineService.isOnline()) {
      const event: MarkDeliveredEvent = {
        ...eventData,
        chatId,
      }
      await this.wsService.sendEvent('dlvrd', event)
    }
    return new Response()
  }

  async readEventHandler(request: Request) {
    const eventData = await request.json<MarkReadInternalEvent>()

    const chatId = eventData.chatId

    const counter = await this.chatStorage(chatId).counter()

    if (counter - 1 === eventData.messageId) {
      const i = this.#chatList.findIndex(chat => chat.id === chatId)
      if (
        !this.#chatList[i].lastMessageStatus ||
        this.#chatList[i].lastMessageStatus === 'undelivered' ||
        this.#chatList[i].lastMessageStatus === 'unread'
      ) {
        this.#chatList[i].lastMessageStatus = 'read'
        this.save()
      }
    }

    if (this.onlineService.isOnline()) {
      const event: MarkReadEvent = {
        ...eventData,
        chatId,
      }
      await this.wsService.sendEvent('read', event)
    }
    return new Response()
  }

  async sendToFavorites(eventData: NewMessageRequest, timestamp: number) {
    const chatId = this.#userId
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
    this.#chatList.unshift(chat)
    this.save()

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  async receiveMessage(eventData: NewMessageEvent | NewGroupMessageEvent) {
    const chatId = eventData.chatId
    const chatData = (await this.chatStorage(chatId).chat(this.#userId)) as Group | Dialog
    const chatIndex = this.#chatList.findIndex(ch => ch.id === chatId)
    let isNew = chatIndex === -1
    const counter = await this.chatStorage(chatId).counter()

    if (isNew || this.#chatList[chatIndex].lastMessageId != chatData.lastMessageId) {
      const chatChanges: Partial<ChatListItem> = {
        id: chatData.chatId,
        lastMessageStatus: chatData.lastMessageStatus,
        lastMessageText: chatData.lastMessageText,
        lastMessageTime: chatData.lastMessageTime,
        name: chatData.name,
        type: isGroup(chatId) ? 'group' : 'dialog',
        verified: false,
        lastMessageAuthor: chatData.lastMessageAuthor,
        photoUrl: chatData.photoUrl,
        isMine: chatData.isMine,
        lastMessageId: chatData.lastMessageId,
        missed: chatData.missed,
      }
      const chat = this.toTop(chatId, chatChanges)

      this.#chatList.unshift(chat)
      this.save()
    }

    let dlvrd = false
    if (this.onlineService.isOnline()) {
      if (isNew) {
        await this.wsService.sendEvent('chats', this.#chatList)
      }
      await this.wsService.sendEvent('new', {
        ...eventData,
        sender: eventData.sender ?? eventData.chatId,
      })
      dlvrd = true
    }
    this.toQ(eventData, chatData, dlvrd)
    return { success: true, dlvrd }
  }

  private async setDeviceTokenHandler(request: Request) {
    const data = await request.json<{ fingerprint: string; deviceToken: string }>()
    this.setFingerprint(data.fingerprint)
    this.setDeviceToken(data.deviceToken)

    return new Response()
  }
  private async setFingerprint(fingerprint: string) {
    await this.state.storage.put('fingerprint', fingerprint)
    this.#fingerprint = fingerprint
  }
  private async setDeviceToken(token?: string) {
    if (token) {
      await this.state.storage.put('deviceToken', token)
      this.#deviceToken = token
    } else {
      if (!this.#deviceToken) {
        this.#deviceToken = (await this.state.storage.get('deviceToken')) || ''
        if (!this.#deviceToken) {
          const tokens = await pushStorage(this.env, this.#userId).getTokens()
          if (tokens && tokens.length) {
            this.#deviceToken = tokens[0].deviceToken
          }
        }
        if (!this.#deviceToken) {
          const tokens = await pushStorage(this.env, this.#fingerprint).getTokens()
          if (tokens && tokens.length) {
            this.#deviceToken = tokens[0].deviceToken
          }
        }
      }
    }
  }

  private async toQ(
    eventData: NewGroupMessageEvent | NewMessageEvent,
    chat: Group | Dialog | DialogAI,
    alreadySentByWebsocket: boolean,
  ) {
    if (!this.#deviceToken) return
    if (!eventData.message) return

    // Count the number of chats with missed messages > 0
    const missedCount = this.#chatList.reduce<number>((p, c, i, a) => p + (c.missed ?? 0), 0)

    const push: PushNotification = {
      event: eventData,
      deviceToken: this.#deviceToken,
      body: eventData.message,
      title: chat.name,
      subtitle: eventData.senderName,
      badge: missedCount,
    }
    this.state.waitUntil(this.env.PUSH_QUEUE.send(push, { contentType: 'json' }))
  }

  async chatsHandler(request: Request) {
    const ai = this.#chatList.find(chat => chat.id === 'AI')
    const gpt = gptStorage(this.env, this.#userId)
    this.#chatList = this.#chatList.filter((chat, index) =>
      chat.id === 'AI' ? this.#chatList.findIndex(c => c.id === 'AI') === index : true,
    )
    if (!ai) {
      const chat = await gpt.create(this.#userId)
      this.#chatList.unshift(chat)

      this.save()
    }
    return new Response(
      JSON.stringify(
        this.#chatList
          .filter((e, i) => this.#chatList.findIndex(chat => chat.id == e.id) === i)
          .map(e => ({
            ...e,
            type: e.type === 'ai' ? 'dialog' : e.type,
            lastMessageId: (e.lastMessageId ?? 0) >= 0 ? e.lastMessageId : 0,
            missed: (e.missed ?? 0) >= 0 ? e.missed : 0,
            lastMessageAuthor: e.lastMessageAuthor ?? this.#userId,
            lastMessageTime: e.lastMessageTime ?? Date.now(),
            lastMessageText: e.lastMessageText ?? '',
            id: e.id,
          })),
      ),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
  async chatHandler(request: Request) {
    const { chatId } = await request.json<GetChatRequest>()
    const chat = await this.chatStorage(chatId).chat(this.#userId)
    return new Response(JSON.stringify(chat), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  async messagesHandler(request: Request) {
    const data = await request.json<GetMessagesRequest>()
    const dialog = this.chatStorage(data.chatId)
    const messages = await dialog.getMessages(data)

    return new Response(JSON.stringify(messages), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  private chatStorage(chatId: string) {
    return chatStorage(this.env, chatId, this.#userId)
  }

  async friendOnline(request: Request) {
    const eventData = await request.json<OnlineEvent>()

    return new Response(
      (await this.wsService.sendEvent('online', { userId: eventData.userId })) ? 'online' : '',
    )
  }

  async friendOffline(request: Request) {
    const eventData = await request.json<OfflineEvent>()
    this.wsService.sendEvent('offline', { userId: eventData.userId })
    return new Response()
  }

  async friendTyping(request: Request) {
    const eventData = await request.json<TypingInternalEvent>()
    const event: TypingServerEvent = { chatId: eventData.userId }
    this.wsService.sendEvent('typing', event)
    return new Response()
  }

  ////////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////////

  private async handleWebsocket(request: Request): Promise<Response> {
    console.log('CONNECT!')
    const response = await this.wsService.acceptWebSocket(request)
    this.state.waitUntil(this.onlineService.online())
    return response
  }
  ////////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////////

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    console.log(message)
    this.wsService.handlePacket(ws, message, this)
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ): Promise<void> {
    await this.wsService.handleClose(ws, code, reason, wasClean)
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    await this.wsService.handleError(ws, error)
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
    console.log('wsRequest: ', JSON.stringify({ type, request }))

    switch (type) {
      case 'new':
        response = await this.newRequest(request as NewMessageRequest)
        return response
      case 'dlvrd':
        return this.dlvrdRequest(request as MarkDeliveredRequest, this.timestamp())
      case 'read':
        response = await this.readRequest(request as MarkReadRequest, this.timestamp())
        return response
      case 'chats':
        response = await this.getChatsRequest(request as GetChatsRequest)
        return response
      case 'chat':
        response = await this.chatStorage((request as GetChatRequest).chatId).chat(this.#userId)
        return response

      case 'messages':
        response = await this.getMessagesRequest(request as GetMessagesRequest)
        return response
    }
  }

  async getChatsRequest(payload: GetChatsRequest): Promise<ChatList> {
    return this.#chatList.filter(chat => chat.id !== this.#userId)
  }

  async getMessagesRequest(payload: GetMessagesRequest): Promise<ChatMessage[]> {
    return this.chatStorage(payload.chatId).getMessages(payload)
  }

  async newRequest(payload: NewMessageRequest) {
    const chatId = payload.chatId
    if (chatId === this.#userId) {
      return this.sendToFavorites(payload, this.timestamp())
    }

    const storage = this.chatStorage(chatId)
    if (!this.#chatList.find(chat => chat.id === chatId)) {
      if (!isGroup(chatId)) {
        await this.state.blockConcurrencyWhile(async () =>
          (storage as DurableObjectStub<DialogsDO>).create(this.#userId, chatId),
        )
      }
    }

    const { messageId, timestamp, clientMessageId } = await storage.newMessage(
      this.#userId,
      payload,
    )

    const dialog: Dialog = await storage.chat(this.#userId)
    const chatChanges: Partial<ChatListItem> = {
      id: chatId,
      lastMessageStatus: 'undelivered',
      lastMessageText: payload.message,
      lastMessageTime: timestamp,
      missed: 0,
      name: dialog.name,
      type: isGroup(chatId) ? 'group' : 'dialog',
      verified: false,
      lastMessageAuthor: '',
      photoUrl: dialog.photoUrl,
      isMine: true,
      lastMessageId: messageId,
      ...(payload.attachments?.length ? { attachmentType: payload.attachments[0].type } : {}),
    }

    const chat = this.toTop(chatId, chatChanges)
    this.#chatList.unshift(chat)

    this.save()
    return { messageId, timestamp, clientMessageId }
  }

  toTop(chatId: string, eventData: Partial<ChatListItem>): ChatListItem {
    const currentChatIndex = this.#chatList.findIndex(chat => chat.id === chatId)
    const currentChat: ChatListItem =
      currentChatIndex === -1
        ? (eventData as ChatListItem)
        : { ...this.#chatList[currentChatIndex], ...eventData }
    if (currentChatIndex >= 0) this.#chatList.splice(currentChatIndex, 1)

    return currentChat
  }

  async dlvrdRequest(payload: MarkDeliveredRequest, timestamp: number) {
    return this.chatStorage(payload.chatId).dlvrd(this.#userId, payload, timestamp)
  }

  async readRequest(payload: MarkReadRequest, timestamp: number) {
    const chatId = payload.chatId

    const resp = (await this.chatStorage(chatId).read(
      this.#userId,
      payload,
      timestamp,
    )) as MarkReadResponse
    const i = this.#chatList.findIndex(chat => chat.id === chatId)
    this.#chatList[i].missed = resp.missed
    this.save()
    return resp
  }

  save() {
    if (this.#chatListTimer) {
      clearTimeout(this.#chatListTimer)
    }
    this.#chatListTimer = setTimeout(async () => {
      await this.state.storage.put('chatList', this.#chatList, {
        allowUnconfirmed: true,
        allowConcurrency: true,
      })
      this.#chatListTimer = undefined
    }, 10)
  }

  async typingEvent(event: TypingClientEvent) {
    const receiverDO = userStorage(this.env, event.chatId)

    await receiverDO.fetch(
      new Request(`${this.env.ORIGIN}/${event.chatId}/messaging/event/typing`, {
        method: 'POST',
        body: JSON.stringify({ userId: this.#userId } as TypingInternalEvent),
      }),
    )
  }

  #userId = ''
  #setUserId(id: string) {
    this.#userId = id
    this.onlineService.setUserId(id)
  }
}
