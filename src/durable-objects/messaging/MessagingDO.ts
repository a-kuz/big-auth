import { ClientEventType, ClientRequestType } from '~/types/ws'
import {
  DeleteRequest,
  GetChatRequest,
  GetChatsRequest,
  GetMessagesRequest,
  GetMessagesResponse,
  MarkDeliveredRequest,
  MarkReadRequest,
  NewMessageRequest,
  SetDeviceTokenRequest,
  TypingClientEvent,
  UpdateProfileRequest,
} from '~/types/ws/client-requests'
import {
  ClientEventPayload,
  ClientRequestPayload,
  ServerResponsePayload,
} from '~/types/ws/payload-types'
import {
  DeleteEvent,
  EditEvent,
  MarkDeliveredEvent,
  MarkReadEvent,
  NewMessageEvent,
  OfflineEvent,
  OnlineEvent,
  TypingServerEvent,
} from '~/types/ws/server-events'
import { ChatList, ChatListItem } from '../../types/ChatList'
import { Env } from '../../types/Env'

import { Profile } from '~/db/models/User'
import { displayName } from '~/services/display-name'
import { Dialog, DialogAI, Group } from '~/types/Chat'
import { PushNotification } from '~/types/queue/PushNotification'
import {
  CloseCallEvent,
  MarkDeliveredInternalEvent,
  MarkReadInternalEvent,
  NewCallEvent,
  NewChatEvent,
  NewGroupMessageEvent,
  TypingInternalEvent,
  UpdateChatInternalEvent,
} from '~/types/ws/internal'
import { MarkReadResponse } from '~/types/ws/responses'
import { callDesription } from '~/utils/call-description'
import { encrypt } from '~/utils/crypto'
import { writeErrorLog } from '~/utils/serialize-error'
import { DebugableDurableObject } from '../DebugableDurableObject'
import { ChatListService } from './ChatListService'
import { ContactsManager } from './ContactsManager'
import { DialogsDO } from './DialogsDO'
import { OnlineStatus, OnlineStatusService } from './OnlineStatusService'
import { ProfileService } from './ProfileService'
import { WebSocketGod } from './WebSocketService'
import {
  chatStorage,
  chatType,
  gptStorage,
  isGroup,
  userStorageById,
} from './utils/get-durable-object'
import { messagePreview } from './utils/message-preview'

export class MessagingDO extends DebugableDurableObject {
  #timestamp = Date.now()
  #deviceToken = ''
  private onlineService!: OnlineStatusService
  private profileService!: ProfileService
  private cl!: ChatListService
  private wsService!: WebSocketGod
  private contacts!: ContactsManager

  constructor(
    readonly ctx: DurableObjectState,
    readonly env: Env,
  ) {
    super(ctx, env)
    this.ctx.blockConcurrencyWhile(async () => this.initialize())
  }

  async initialize() {
    this.#userId = (await this.ctx.storage.get('userId')) || 'ALARM! NO USER ID'
    this.#deviceToken = (await this.ctx.storage.get<string>('deviceToken')) || ''

    this.wsService = new WebSocketGod(this.ctx, this.env)
    this.profileService = new ProfileService(this.ctx, this.env)
    this.cl = new ChatListService(this.ctx, this.env, this.wsService)
    this.onlineService = new OnlineStatusService(this.ctx, this.env, this.wsService, this.cl)
    this.wsService.onlineService = this.onlineService

    this.contacts = new ContactsManager(
      this.env,
      this.ctx,
      this.profileService,
      this.cl,
      this.onlineService,
    )
    this.cl.contacts = this.contacts
    this.cl.onlineService = this.onlineService
    await this.cl.initialize()
  }
  async alarm(): Promise<void> {
    await this.wsService.alarm()
  }

  async fetch(request: Request) {
    const url = new URL(request.url)
    const paths = url.pathname
      .split('/')
      .filter(p => p)
      .slice(-4)

    const [userId, from, type, action] = paths as [string, 'client', 'connect', 'websocket']
    if (!this.#userId) {
      await this.setUserId(userId)
    }
    console.log(JSON.stringify({ from, type, action }, null, 2))
    if (type === 'connect' && action === 'websocket') {
      return this.handleWebsocket(request)
    }

    return new Response(`${url.pathname} ❹０𝟢𝟬𝟎𝟢０❹  `, { status: 404 })
  }

  async debugInfo() {
    if (this.env.ENV === 'production') return 'Not found'
    const keys = await this.ctx.storage.list() || {}
    const result = {}
    for (const key of keys.keys()) {
      const value = keys.get(key)
      //@ts-ignore
      result[key] = value
    }

    return DebugableDurableObject.returnBigResult(result, 0) as string
  }
  
  async newChatEvent(event: NewChatEvent) {
    const { chatId, name, meta } = event
    const { owner } = meta
    const chat = this.cl.toTop(chatId, {
      id: chatId,
      photoUrl: event.photoUrl,
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
    await this.chatsEvent(this.cl.chatList)
  }

  async chatsEvent(chats: ChatList) {
    await this.wsService.toSockets('chats', this.cl.chatList)
  }

  
  async newCallEvent(event: NewCallEvent) {
    await this.wsService.toSockets('newCall', event)
  }
  async closeCallEvent(event: CloseCallEvent) {
    const { chatId } = event
    const text = callDesription(event)
    const chat = this.cl.toTop(chatId, {
      id: chatId,
      lastMessageStatus: 'undelivered',
      lastMessageText: text,
      lastMessageTime: this.timestamp(),
      lastMessageId: event.messageId,
      lastMessageAuthor: event.direction === 'incoming' ? chatId : '',
      isMine: event.direction === 'outgoing',
      missed: event.missed,
      firstMissed: event.firstMissed,
    })
    chat.missed = 0
    this.cl.chatList.unshift(chat)

    await this.cl.save()
    await this.wsService.toSockets('closeCall', event)
    return new Response()
  }

  async updateChatEvent(event: UpdateChatInternalEvent) {
    const chatData = await this.contacts.patchChat(event.chatId!, event as Dialog | Group)
    this.cl.updateChat(chatData)
  }


  async deleteEvent(event: DeleteEvent) {
    await this.wsService.toSockets('delete', event)
    return {}
  }
  async editEvent(event: EditEvent) {
    //await this.wsService.toSockets('delete', event)
    return {}
  }

  async dlvrdEvent(event: MarkDeliveredInternalEvent) {
    const chatId = event.chatId

    console.log(JSON.stringify(event))
    const i = this.cl.chatList.findIndex(chat => chat.id === chatId)
    if (i === -1) return
    if (
      !this.cl.chatList[i].lastMessageStatus ||
      this.cl.chatList[i].lastMessageStatus === 'undelivered'
    ) {
      this.cl.chatList[i].lastMessageStatus = 'unread'
      await this.cl.save()
    }

    if (this.onlineService.isOnline()) {
      const wsEvent: MarkDeliveredEvent = {
        ...event,
        chatId,
      }
      await this.wsService.toSockets('dlvrd', wsEvent)
    }
  }
  
  async readEvent(event: MarkReadInternalEvent) {
    const chatId = event.chatId
    const counter = await this.chatStorage(chatId).counter()

    if (counter - 1 === event.messageId) {
      const i = this.cl.chatList.findIndex(chat => chat.id === chatId)
      if (i === -1) return
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
      const wsEvent: MarkReadEvent = event
      await this.wsService.toSockets('read', wsEvent)
    }
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
  async newEvent(eventData: NewMessageEvent | NewGroupMessageEvent) {
    const chatId = eventData.chatId
    const chatIndex = this.cl.chatList.findIndex(ch => ch.id === chatId)
    let isNew = chatIndex === -1
    let chatData = (await this.chatStorage(chatId).chat(this.#userId)) as Group | Dialog
    let name = chatData.name,
      verified = false
    if (chatType(chatId) === 'dialog') {
      const contact = await this.contacts.contact(chatId)
      if (contact) {
        name = displayName(contact)
        verified = contact.verified ?? false
      }
    }

    if (isNew || (this.cl.chatList[chatIndex].lastMessageId ?? -1) < eventData.messageId) {
      const chatChanges: Partial<ChatListItem> = {
        id: eventData.chatId,
        lastMessageStatus: this.onlineService.isOnline() ? 'unread' : 'undelivered',
        lastMessageText: messagePreview(eventData.message),

        name,
        type: chatType(chatId),
        verified,
        lastMessageAuthor: chatData.lastMessageAuthor,
        photoUrl: chatData.photoUrl,
        isMine: false,
        lastMessageId: chatData.lastMessageId,
        missed: chatData.missed,
        firstMissed: chatData.firstMissed,
        lastMessageTime: chatData.lastMessageTime,
      }
      const chat = this.cl.toTop(chatId, chatChanges)
      if (isNew && chat.lastSeen !== undefined) delete chat.lastSeen
      this.cl.chatList.unshift(chat)
      if (isGroup(chatId)) {
        const contact = await this.contacts.contact(eventData.sender)

        eventData.senderName = displayName(contact)
      }

      this.ctx.waitUntil(this.pushPush(eventData, name, chatData.photoUrl))
      await this.cl.save()
    }

    let dlvrd = false
    if (this.onlineService.isOnline()) {
      if (isNew) {
        await this.wsService.toSockets('chats', this.cl.chatList)
        await this.onlineService.sendOnlineTo(chatId)
      }
      await this.wsService.toSockets('new', {
        ...eventData,
        sender: eventData.sender ?? eventData.chatId,
      })
      dlvrd = true
    }

    return { success: true, dlvrd }
  }


  async updateProfileRequest(request: UpdateProfileRequest) {
    await this.profileService.broadcastProfile(request)
  }

  async updateContactsRequest(contacts: Profile[], replace = false) {
    try {
      if (replace) {
        await this.contacts.replaceContacts(contacts)
      } else {
        await this.contacts.updateContacts(contacts)
      }
    } catch (e) {
      await writeErrorLog(e)
    }
    return new Response()
  }

  async contactsReqest() {
    const contacts = await this.contacts.bigUsers()
    return contacts
  }


  async setDeviceToken(request: SetDeviceTokenRequest) {
    const token = request.deviceToken
    if (token) {
      await this.ctx.storage.put('deviceToken', token)
      this.#deviceToken = token
    }
  }

  private async pushPush(
    eventData: NewGroupMessageEvent | NewMessageEvent,
    title: string,
    imgUrl?: string,
  ): Promise<void> {
    if (!this.#deviceToken) return
    if (!eventData.message) return

    // Count the number of chats with missed messages > 0
    const missedCount = this.cl.chatList.reduce<number>(
      (prev, curr) => prev + Math.max(curr.missed ?? 0, 0),
      0,
    )

    const push: PushNotification = {
      event: {
        ...eventData,
        confirmationUrl: await this.confirmationUrl(
          this.#userId,
          eventData.chatId,
          eventData.messageId,
        ),
        userId: this.#userId,
      },
      deviceToken: this.#deviceToken,
      body: eventData.message!,
      title,
      imgUrl,
      subtitle: eventData.senderName,
      badge: missedCount,
      threadId: eventData.chatId,
      category: 'message',
    }
    await this.env.PUSH_QUEUE.send(push, { contentType: 'json' })
  }

  private async confirmationUrl(
    userId: string,
    chatId: string,
    messageId: number,
  ): Promise<string> {
    if (this.env.ENV === 'dev') {
      return `${this.env.DLVRD_BASE_URL}${await encrypt(`${userId}.${chatId}.${messageId}`, this.env.ENV)}`
    } else {
      return `${this.env.ORIGIN}/blink/${userId}`
    }
  }


  async blinkRequest() {
    await this.onlineService.blink()
  }


  private async checkAi() {
    const ai = this.cl.chatList.find(chat => chat.id === 'AI')
    if (!ai) {
      const gpt = gptStorage(this.env, this.#userId)
      const chat = (await gpt.create(this.#userId)) as DialogAI
      const chatListItem: ChatListItem = {
        name: chat.name,
        missed: 0,
        id: chat.chatId,
        type: 'ai',
        verified: true,
      }
      this.cl.chatList.unshift(chatListItem)
      await this.cl.save()
    }
  }


  
  private chatStorage(chatId: string) {
    return chatStorage(this.env, chatId, this.#userId)
  }
  
  async onlineStatus(): Promise<OnlineStatus> {
    return this.onlineService.status()
  }


  async onlineEvent(eventData: OnlineEvent) {
    const chatIndex = this.cl.chatList.findIndex(chat => chat.id === eventData.userId)
    if (chatIndex >= 0) {
      this.cl.chatList[chatIndex].lastSeen = undefined
      await this.cl.save()
    }
    await this.wsService.toSockets('online', eventData, 1, `${eventData.userId}::status`)
    return this.onlineService.status()
  }


  async offlineEvent(eventData: OfflineEvent) {
    const chatIndex = this.cl.chatList.findIndex(chat => chat.id === eventData.userId)
    if (chatIndex >= 0) {
      this.cl.chatList[chatIndex].lastSeen = eventData.lastSeen || this.timestamp()
      await this.cl.save()
    }
    this.wsService.toSockets('offline', eventData, 1000, `${eventData.userId}::status`)
    return this.onlineService.status()
  }

  
  ////////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////////

  private async handleWebsocket(request: Request): Promise<Response> {
    await this.onlineService.online()
    this.ctx.blockConcurrencyWhile(async () => {
      await this.contacts.loadChatList()
    })
    const response = await this.wsService.acceptWebSocket(request)
    return response
  }
  ////////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////////

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.wsService.handlePacket(ws, message, this)
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

    switch (type) {
      case 'new':
        response = await this.newRequest(request as NewMessageRequest)
        return response
      case 'dlvrd':
        return this.dlvrdRequest(request as MarkDeliveredRequest, this.timestamp())
      case 'read':
        response = await this.readRequest(request as MarkReadRequest, this.timestamp())
        return response
      case 'delete':
        response = await this.deleteRequest(request as DeleteRequest)
        return response
      case 'chats':
        response = await this.chatsRequest(request as GetChatsRequest)
        return response
      case 'chat':
        response = await this.chatRequest(request)
        return response

      case 'messages':
        response = await this.messagesRequest(request as GetMessagesRequest)
        return response
    }
  }

  async chatRequest(request: ClientRequestPayload) {
    return this.cl.chatRequest(request.chatId, this.#userId)
  }

  async chatsRequest(payload: GetChatsRequest): Promise<ChatList> {
    return this.cl.chatList.filter(chat => chat.id !== this.#userId)
  }

  async messagesRequest(payload: GetMessagesRequest): Promise<GetMessagesResponse> {

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
    const chatId = payload.chatId;
    if (chatId === this.#userId) {
      return this.sendToFavorites(payload, this.timestamp())
    }

    const storage = this.chatStorage(chatId)
    const chatItem = this.cl.chatList.find(chat => chat.id === chatId)
    let lastSeen = chatItem?.lastSeen
    if (!chatItem) {
      if (!isGroup(chatId)) {
        lastSeen = await this.onlineService.lastSeenOf(chatId)
        await this.ctx.blockConcurrencyWhile(async () => {
          await (storage as DurableObjectStub<DialogsDO>).create(this.#userId, chatId)
        })
      }
    }

    const { messageId, timestamp, clientMessageId } = await storage.newMessage(
      this.#userId,
      payload,
    )

    let dialog = (await storage.chat(this.#userId)) as Dialog | Group
    dialog = await this.contacts.patchChat(chatId, dialog)
    let name = dialog.name

    const chatChanges: Partial<ChatListItem> = {
      id: chatId,
      lastMessageStatus: isGroup(chatId) ? 'undelivered' : lastSeen ? 'undelivered' : 'unread',
      lastMessageText: payload.message,
      lastMessageTime: timestamp,
      lastMessageAuthor: '',
      missed: 0,
      name,
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
  async deleteRequest(payload: DeleteRequest) {
    return this.chatStorage(payload.chatId).deleteMessage(this.#userId, payload)
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
  async incomingTypingEvent(eventData: TypingInternalEvent) {
    const event: TypingServerEvent = { chatId: eventData.userId, stop: eventData.stop }
    this.wsService.toSockets('typing', event, 1, `${eventData.userId}::typing`)
  }

  async typingEvent(event: TypingClientEvent) {
    const receiverDO = userStorageById(this.env, event.chatId)
    await receiverDO.incomingTypingEvent({ userId: this.#userId, stop: event.stop })
  }

  private timestamp() {
    const current = performance.now()
    return (this.#timestamp = current > this.#timestamp ? current : ++this.#timestamp)
  }
  #userId = ''
  async setUserId(id: string) {
    this.#userId = id
    this.checkAi()
    await this.ctx.storage.put('userId', id)
    await this.onlineService.setUserId(id)
  }
}
