import { ChatMessage } from '~/types/ChatMessage'
import { ClientEventType, ClientRequestType, ServerEventType } from '~/types/ws'
import {
  GetChatRequest,
  GetChatsRequest,
  GetMessagesRequest,
  GetMessagesResponse,
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
  UpdateChatInternalEvent,
} from '~/types/ws/internal'
import { MarkReadResponse } from '~/types/ws/responses'
import { DialogsDO } from './DialogsDO'
import { OnlineStatusService } from './OnlineStatusService'
import { WebSocketGod } from './WebSocketService'
import { chatStorage, chatType, gptStorage, isGroup, fingerprintDO, userStorage } from './utils/mdo'
import { ProfileService } from './ProfileService'
import { Profile } from '~/db/models/User'

export class UserMessagingDO implements DurableObject {
  readonly ['__DURABLE_OBJECT_BRAND']!: never
  #chatList: ChatList = []
  #timestamp = Date.now()
  #deviceToken = ''
  #fingerprint = ''
  #chatListTimer: NodeJS.Timeout | undefined
  private readonly wsService: WebSocketGod
  private readonly onlineService: OnlineStatusService
  private readonly profileService: ProfileService
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    this.wsService = new WebSocketGod(state, env)
    this.onlineService = new OnlineStatusService(this.state, this.env, this.wsService)
    this.profileService = new ProfileService(this.state, this.env)
    this.wsService.onlineService = this.onlineService
    this.state.blockConcurrencyWhile(async () => {
      this.#chatList = (await this.state.storage.get<ChatList>('chatList')) || []
      this.#fingerprint = (await this.state.storage.get<string>('fingerprint')) || ''
      this.#deviceToken = (await this.state.storage.get<string>('deviceToken')) || ''
    })
  }

  private timestamp() {
    const current = performance.now()
    return (this.#timestamp = current > this.#timestamp ? current : ++this.#timestamp)
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
        | 'updateProfile'
        | 'updateChat'
        | 'blink'
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
              case 'updateProfile':
                return this.updateProfileHandler(request)
              case 'blink':
                return this.blinkHandler(request);
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
          case 'updateChat':
            return this.updateChatEventHandler(request)
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
          case 'updateChat':
            return this.updateChatEventHandler(request)
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
      photoUrl: eventData.photoUrl,
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
      await this.wsService.toBuffer('chats', this.#chatList)
    }

    return new Response()
  }
  async updateChatEventHandler(request: Request) {
    const eventData = await request.json<UpdateChatInternalEvent>()
    const { chatId, name, meta, photoUrl } = eventData
    const index = this.#chatList.findIndex(chat => chat.id === eventData.chatId)
    this.#chatList[index].name = name
    this.#chatList[index].photoUrl = photoUrl
    await this.wsService.toBuffer('chats', this.#chatList)
    this.save()

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
      await this.wsService.toBuffer('dlvrd', event)
    }
    return new Response()
  }
  async readEventHandler(request: Request) {
    const eventData = await request.json<MarkReadInternalEvent>()

    const chatId = eventData.chatId
    console.log({ chatId })
    console.log({ eventData })

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
      await this.wsService.toBuffer('read', event)
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
    const chatIndex = this.#chatList.findIndex(ch => ch.id === chatId)
    let isNew = chatIndex === -1
    let someChatData
    const chatlListItem = this.#chatList.find(e => e.id === chatId)
    if (chatlListItem) {
			someChatData = {...chatlListItem, chatId}
    } else {
			someChatData = (await this.chatStorage(chatId).chat(this.#userId)) as Group | Dialog
    }
		this.toQ(eventData, someChatData.name, someChatData.photoUrl)
    if (isNew || this.#chatList[chatIndex].lastMessageId < eventData.messageId) {
      const chatChanges: Partial<ChatListItem> = {
        id: eventData.chatId,
        lastMessageStatus: this.onlineService.isOnline() ? 'unread' : 'undelivered',
        lastMessageText: eventData.message
          ? eventData.message.length > 133
            ? eventData.message?.slice(0, 130) + '...'
            : eventData.message
          : '',
        lastMessageTime: eventData.timestamp,
        name: someChatData.name,
        type: chatType(chatId),
        verified: false,
        lastMessageAuthor: eventData.senderName,
        photoUrl: someChatData.photoUrl,
        isMine: eventData.sender === this.#userId,
        lastMessageId: eventData.messageId,
        missed: eventData.missed,
      }
      const chat = this.toTop(chatId, chatChanges)

      this.#chatList.unshift(chat)
      this.save()
    }

    let dlvrd = false
    if (this.onlineService.isOnline()) {
      if (isNew) {
        await this.wsService.toBuffer('chats', this.#chatList)
      }
      await this.wsService.toBuffer('new', {
        ...eventData,
        ...{ missed: eventData.missed },
        sender: eventData.sender ?? eventData.chatId,
      })
      dlvrd = true
    }

    return { success: true, dlvrd }
  }

  private async updateProfileHandler(request: Request) {
    const profile = await request.json<Profile>()
    await this.profileService.broadcastProfile(profile)
    return new Response()
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
      }
    }
  }
  private toQ(eventData: NewGroupMessageEvent | NewMessageEvent, title: string, imgUrl?: string) {
    if (!this.#deviceToken) return
    if (!eventData.message) return

    // Count the number of chats with missed messages > 0
    const missedCount = this.#chatList.reduce<number>((p, c, i, a) => p + (c.missed ?? 0), 0)

    const push: PushNotification = {
      event: eventData,
      deviceToken: this.#deviceToken,
      body: eventData.message,
      title,
      imgUrl,
      subtitle: eventData.senderName,
      badge: missedCount,
      threadId: eventData.chatId,
      category: 'message',
    }
    this.state.waitUntil(this.env.PUSH_QUEUE.send(push, { contentType: 'json' }))
  }

  async blinkHandler(request: Request) {
    this.onlineService.blink();
    return new Response();
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
            type: chatType(e.id),
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

    const messages = await this.getMessagesRequest(data)

    return new Response(JSON.stringify(messages), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  private chatStorage(chatId: string) {
    return chatStorage(this.env, chatId, this.#userId)
  }
  async friendOnline(request: Request) {
    const eventData = await request.json<OnlineEvent>()
    const chatIndex = this.#chatList.findIndex(chat => chat.id === eventData.userId)
    if (chatIndex >= 0) {
      this.#chatList[chatIndex].lastSeen = undefined
      this.save()
    }
    await this.wsService.toBuffer('online', eventData)
    return new Response(JSON.stringify(this.onlineService.status()))
  }
  async friendOffline(request: Request) {
    const eventData = await request.json<OfflineEvent>()
    const chatIndex = this.#chatList.findIndex(chat => chat.id === eventData.userId)
    if (chatIndex >= 0) {
      this.#chatList[chatIndex].lastSeen = eventData.lastSeen
      this.save()
    }
    this.wsService.toBuffer('offline', eventData)
    return new Response()
  }
  async friendTyping(request: Request) {
    const eventData = await request.json<TypingInternalEvent>()
    const event: TypingServerEvent = { chatId: eventData.userId }
    this.wsService.toBuffer('typing', event)
    return new Response()
  }

  ////////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////////

  private async handleWebsocket(request: Request): Promise<Response> {
    console.log('CONNECT!')
    this.wsService.clearBuffer()
    const response = await this.wsService.acceptWebSocket(request)
    this.state.waitUntil(
      (async () => {
        this.#chatList = await this.onlineService.online()
        return
      })(),
    )
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

  async getMessagesRequest(payload: GetMessagesRequest): Promise<GetMessagesResponse> {
    const resp: GetMessagesResponse = await this.chatStorage(payload.chatId).getMessages(
      payload,
      this.#userId,
    )
    resp.messages = resp.messages.filter(
      m =>
        resp.messages.findIndex(m2 => m2.clientMessageId === m.clientMessageId) ===
        resp.messages.findLastIndex(m2 => m2.clientMessageId === m.clientMessageId),
    )
    return resp
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
      type: chatType(chatId),
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
