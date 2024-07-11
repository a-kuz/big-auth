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

import { Dialog, DialogAI, Group, GroupChat } from '~/types/Chat'
import { PushNotification } from '~/types/queue/PushNotification'
import {
  InternalEventType,
  MarkDeliveredInternalEvent,
  MarkReadInternalEvent,
  NewCallEvent,
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
import { ChatListService } from './ChatListService'
import { messagePreview } from './utils/message-preview'
import { getUserById } from '~/db/services/get-user'
import { displayName } from '~/services/display-name'
import { captureRejectionSymbol } from 'events'
import { stat } from 'fs'
import { DebugWrapper } from '../DebugWrapper'

export class UserMessagingDO implements DurableObject {
  readonly ['__DURABLE_OBJECT_BRAND']!: never
  #timestamp = Date.now()
  #deviceToken = ''
  private wsService!: WebSocketGod
  private onlineService!: OnlineStatusService
  private profileService!: ProfileService
  private cl!: ChatListService
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    this.state.blockConcurrencyWhile(async () => {
      this.wsService = new WebSocketGod(state, env)
      this.profileService = new ProfileService(this.state, this.env)
      this.cl = new ChatListService(this.state, this.env)
      this.onlineService = new OnlineStatusService(this.state, this.env, this.wsService, this.cl)
      this.wsService.onlineService = this.onlineService

      this.#deviceToken = (await this.state.storage.get<string>('deviceToken')) || ''
    })
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
        | 'lastSeen'
        | 'debug'
      ),
    ]
    if (!this.#userId) {
      await this.#setUserId(userId)
      if (action !== 'setDeviceToken') {
        await this.setDeviceToken()
      }
    }
    console.log(JSON.stringify({ from, type, action }, null, 2))

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
                return this.blinkHandler(request)
              case 'lastSeen':
                return this.lastSeenHandler(request)
              case 'debug':
                return this.debugHandler(request)
            }
        }

      case 'group': {
        switch (action) {
          case 'newChat':
            return this.newChatEventHandler(request)
          case 'newCall':
            return this.newCallEventHandler(request)
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
          case 'request':
            switch (action) {
              case 'lastSeen':
                return this.lastSeenHandler(request)
            }
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

  async debugHandler(request: Request) {
    if (this.env.ENV === 'production') return
    const keys = await this.state.storage.list()
    const result = {}
    for (const key of keys.keys()) {
      const value = keys.get(key)
      //@ts-ignore
      result[key] = value
    }

    return new Response(DebugWrapper.returnBigResult(result, 0))
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
    const chat = this.cl.toTop(chatId, {
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
    this.cl.chatList.unshift(chat)
    await this.cl.save()
    if (this.onlineService.isOnline()) {
      await this.wsService.toBuffer('chats', this.cl.chatList)
    }

    return new Response()
  }
  async newCallEventHandler(request: Request) {
    const eventData = await request.json<NewCallEvent>()
    await this.wsService.toBuffer('newCall', eventData)
    return new Response()
  }
  async updateChatEventHandler(request: Request) {
    const eventData = await request.json<UpdateChatInternalEvent>()
    const { chatId, name, meta, photoUrl } = eventData
    const index = this.cl.chatList.findIndex(chat => chat.id === chatId)
    this.cl.chatList[index].name = name
    this.cl.chatList[index].photoUrl = photoUrl
    await this.wsService.toBuffer('chats', this.cl.chatList)
    await this.cl.save()

    return new Response()
  }
  async dlvrdEventHandler(request: Request) {
    const eventData = await request.json<MarkDeliveredInternalEvent>()

    const chatId = eventData.chatId

    console.log(JSON.stringify(eventData))
    const i = this.cl.chatList.findIndex(chat => chat.id === chatId)
    if (
      !this.cl.chatList[i].lastMessageStatus ||
      this.cl.chatList[i].lastMessageStatus === 'undelivered'
    ) {
      this.cl.chatList[i].lastMessageStatus = 'unread'
      await this.cl.save()
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
      const i = this.cl.chatList.findIndex(chat => chat.id === chatId)
      if (
        !this.cl.chatList[i].lastMessageStatus ||
        this.cl.chatList[i].lastMessageStatus === 'undelivered' ||
        this.cl.chatList[i].lastMessageStatus === 'unread'
      ) {
        this.cl.chatList[i].lastMessageStatus = 'read'
        await this.cl.save()
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
    const chat = this.cl.toTop(chatId, {
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
    this.cl.chatList.unshift(chat)
    await this.cl.save()

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  async receiveMessage(eventData: NewMessageEvent | NewGroupMessageEvent) {
    const chatId = eventData.chatId
    const chatIndex = this.cl.chatList.findIndex(ch => ch.id === chatId)
    let isNew = chatIndex === -1
    let chatData = (await this.chatStorage(chatId).chat(this.#userId)) as Group | Dialog

    this.toQ(eventData, chatData.name, chatData.photoUrl)
    if (isNew || this.cl.chatList[chatIndex].lastMessageId < eventData.messageId) {
      const chatChanges: Partial<ChatListItem> = {
        id: eventData.chatId,
        lastMessageStatus: this.onlineService.isOnline() ? 'unread' : 'undelivered',
        lastMessageText: messagePreview(eventData.message),

        name: chatData.name,
        type: chatType(chatId),
        verified: false,
        lastMessageAuthor: chatData.lastMessageAuthor,
        photoUrl: chatData.photoUrl,
        isMine: false,
        lastMessageId: chatData.lastMessageId,
        missed: chatData.missed,
        lastMessageTime: chatData.lastMessageTime,
      }
      const chat = this.cl.toTop(chatId, chatChanges)
      if (isNew && chat.lastSeen !== undefined) delete chat.lastSeen
      this.cl.chatList.unshift(chat)
      await this.cl.save()
    }

    let dlvrd = false
    if (this.onlineService.isOnline()) {
      if (isNew) {
        await this.wsService.toBuffer('chats', this.cl.chatList)
        await this.onlineService.sendOnlineTo(chatId)
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

    this.setDeviceToken(data.deviceToken)

    return new Response()
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
    const missedCount = this.cl.chatList.reduce<number>(
      (p, c, i, a) => p + Math.max(c.missed ?? 0, 0),
      0,
    )

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
    await this.onlineService.blink()
    return new Response()
  }

  async chatsHandler(request: Request) {
    await this.checkAi()
    return new Response(JSON.stringify(this.cl.chatList), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  private async checkAi() {
    const ai = this.cl.chatList.find(chat => chat.id === 'AI')
    if (!ai) {
      const gpt = gptStorage(this.env, this.#userId)
      const chat = await gpt.create(this.#userId)
      this.cl.chatList.unshift(chat)
      await this.cl.save()
    }
  }

  async chatHandler(request: Request) {
    const { chatId } = await request.json<GetChatRequest>()
    let result: Dialog
    const chatItem = this.cl.chatList.find(chat => chat.id === chatId)
    if (chatItem) {
      const chat = this.chatStorage(chatId)

      result = await chat.chat(this.#userId)
    } else {
      const user = (await getUserById(this.env.DB, chatId)).profile()
      result = {
        chatId,
        type: 'dialog',
        name: displayName(user),
        photoUrl: user.avatarUrl,
        isMine: false,
        lastMessageId: 0,
        meta: {
          ...user,
        },
        missed: 0,
      }
    }
    return new Response(JSON.stringify(result), {
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
  async lastSeenHandler(request: Request) {
    await this.state.storage.sync()
    return new Response(JSON.stringify(this.onlineService.status()))
  }
  async friendOnline(request: Request) {
    const eventData = await request.json<OnlineEvent>()
    const chatIndex = this.cl.chatList.findIndex(chat => chat.id === eventData.userId)
    if (chatIndex >= 0) {
      this.cl.chatList[chatIndex].lastSeen = undefined
      await this.cl.save()
    }
    await this.wsService.toBuffer('online', eventData)
    return new Response(JSON.stringify(this.onlineService.status()))
  }
  async friendOffline(request: Request) {
    const eventData = await request.json<OfflineEvent>()
    const chatIndex = this.cl.chatList.findIndex(chat => chat.id === eventData.userId)
    if (chatIndex >= 0) {
      this.cl.chatList[chatIndex].lastSeen = eventData.lastSeen || this.timestamp()
      await this.cl.save()
    }
    this.wsService.toBuffer('offline', eventData)
    return new Response(JSON.stringify(this.onlineService.status()))
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
    await this.onlineService.online()
    const response = await this.wsService.acceptWebSocket(request)
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
    return this.cl.chatList.filter(chat => chat.id !== this.#userId)
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
    const chatItem = this.cl.chatList.find(chat => chat.id === chatId)
    let lastSeen = chatItem?.lastSeen
    if (!chatItem) {
      if (!isGroup(chatId)) {
        lastSeen = await this.onlineService.lastSeenOf(chatId)
        await this.state.blockConcurrencyWhile(async () => {
          await (storage as DurableObjectStub<DialogsDO>).create(this.#userId, chatId)
        })
      }
    }

    const { messageId, timestamp, clientMessageId } = await storage.newMessage(
      this.#userId,
      payload,
    )

    const dialog = (await storage.chat(this.#userId)) as Dialog | Group
    const chatChanges: Partial<ChatListItem> = {
      id: chatId,
      lastMessageStatus: isGroup(chatId) ? 'undelivered' : lastSeen ? 'undelivered' : 'unread',
      lastMessageText: payload.message,
      lastMessageTime: timestamp,
      lastMessageAuthor: '',
      missed: 0,
      name: dialog.name,
      type: chatType(chatId),
      verified: dialog.meta.verified || false,
      photoUrl: dialog.photoUrl,
      isMine: true,
      lastMessageId: messageId,
      ...(payload.attachments?.length ? { attachmentType: payload.attachments[0].type } : {}),
    }

    const chat = this.cl.toTop(chatId, chatChanges)
    this.cl.chatList.unshift(chat)

    await this.cl.save()
    if (!chatItem) {
      await this.onlineService.sendOnlineTo(chatId)
    }

    return { messageId, timestamp, clientMessageId }
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
    const i = this.cl.chatList.findIndex(chat => chat.id === chatId)
    this.cl.chatList[i].missed = resp.missed
    await this.cl.save()
    return resp
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
  private timestamp() {
    const current = performance.now()
    return (this.#timestamp = current > this.#timestamp ? current : ++this.#timestamp)
  }
  #userId = ''
  async #setUserId(id: string) {
    this.#userId = id
    await this.onlineService.setUserId(id)
  }
}
