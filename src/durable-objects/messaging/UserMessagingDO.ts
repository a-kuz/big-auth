import { getUserById } from '~/db/services/get-user'
import { ChatList, ChatListItem } from '../../types/ChatList'
import { Env } from '../../types/Env'
import {
  EditMessageEvent,
  Event,
  NewMessageEvent,
  OfflineEvent,
  OnlineEvent,
} from '../../types/Event'
import { errorResponse } from '../../utils/error-response'
import { newId } from '../../utils/new-id'
import { displayName } from '~/services/display-name'

const PING = String.fromCharCode(0x9)
const PONG = String.fromCharCode(0xa)
const PING_BYTE = Uint8Array.from([0x9]).buffer
const PONG_BYTE = Uint8Array.from([0x10]).buffer
const SEVEN_DAYS = 604800000
export class UserMessagingDO implements DurableObject {
  public server?: WebSocket
  lastPing = 0
  id = newId(3)
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    console.log({ uuid: this.id, id: state.id })

    this.state.setHibernatableWebSocketEventTimeout(SEVEN_DAYS / 7) // :))
  }

  async alarm(): Promise<void> {
    if (this.server) {
      console.log({ readyState: this.server.readyState })

      if (this.lastPing)
        if (new Date() - this.lastPing > 20000) {
          //@ts-ignore
          try {
            this.server.close()
            //@ts-ignore
            this.server = null
            this.lastPing = 0
          } catch (e) {
            console.error(e)
          }
          // await this.offline()
          return
        }

      await this.state.storage.setAlarm(Date.now() + 1000, { allowConcurrency: false })
    }
  }

  async fetch(request: Request) {
    const url = new URL(request.url)
    const paths = url.pathname
      .split('/')
      .filter(p => p)
      .slice(-2)
    this.userId = paths[0]
    const action = paths[1]
    this.#origin = url.origin
    // console.log({
    //   f: 'fetch',
    //   id: this.id,
    //   url: request.url,
    //   userId: this.userId,
    //   server: this.server,
    //   wss: this.state.getWebSockets(),
    //   r: request.fetcher,
    // })

    switch (action) {
      case 'websocket':
        return this.userSocket(request)
      case 'online':
        return this.friendOnline(request)
      case 'offline':
        return this.friendOffline(request)
      case 'send':
      case 'receive':
        return await this.dialogMessage(request)
      case 'edit':
        return this.editMessage(request)
      case 'chat':
        return this.fetchMessages(request)
      case 'chats':
        return this.fetchChats(request)
      default:
        return new Response(`${url.pathname} Not found`, { status: 404 })
    }
  }

  async dialogMessage(request: Request) {
    const eventData = await request.json<NewMessageEvent>()
    const eventId = ((await this.state.storage.get<number>('eventIdCounter')) || 0) + 1

    await this.state.storage.put(`event-${eventId}`, eventData)
    await this.state.storage.put('eventIdCounter', eventId)

    if (eventData.receiverId === eventData.senderId) {
      return this.sendToFavorites(eventId, eventData)
    } else if (eventData.receiverId === this.userId) {
      return new Response(JSON.stringify(await this.receiveMessage(eventId, eventData)))
    } else {
      return new Response(JSON.stringify(await this.sendMessage(eventId, eventData)))
    }
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

  async sendToFavorites(eventId: number, eventData: NewMessageEvent) {
    const chatId = this.userId
    const [chats, chat] = this.toTop(
      (await this.state.storage.get<ChatList>('chatList')) || [],
      chatId,
      {
        id: chatId,
        lastMessageStatus: 'read',
        lastMessageText: eventData.message,
        lastMessageTime: eventData.timestamp,
        name: 'Favorites',
        type: 'favorites',
        verified: false,
        lastMessageAuthor: chatId,
      },
    )
    chat.missedMessagesCount = 0
    chats.unshift(chat)
    await this.state.storage.put('chatList', chats)

    return new Response(JSON.stringify({ success: true, eventId }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  async receiveMessage(eventId: number, eventData: NewMessageEvent) {
    const chatId = eventData.senderId
    const dialog = await this.dialogNameAndAvatar(chatId)
    const chatChanges: Partial<ChatListItem> = {
      id: chatId,
      lastMessageStatus: 'unread',
      lastMessageText: eventData.message,
      lastMessageTime: eventData.timestamp,
      name: dialog[0],
      type: 'dialog',
      verified: false,
      lastMessageAuthor: dialog[0],
      photoUrl: dialog[1],
    }
    const [chats, chat] = this.toTop(
      (await this.state.storage.get<ChatList>('chatList')) || [],
      chatId,
      chatChanges,
    )
    chat.missedMessagesCount = (chat.missedMessagesCount ?? 0) + 1
    chats.unshift(chat)
    await this.state.storage.put('chatList', chats)
    return { success: true, eventId }
  }

  async dialogNameAndAvatar(id: string): Promise<[string, string?]> {
    const cache = this.#dialogNameCaches.get(id)
    if (cache) return cache

    try {
      const user = await getUserById(this.env.DB, id)
      const result = [displayName(user), user.avatarUrl]
      // this.#dialogNameCaches.set(id, result)
      return result as [string, string?]
    } catch (e) {
      return ['@' + id, undefined]
    }
  }

  async sendMessage(eventId: number, eventData: NewMessageEvent) {
    const chatId = eventData.receiverId
    const dialog = await this.dialogNameAndAvatar(chatId)
    const chatChanges: Partial<ChatListItem> = {
      id: chatId,
      lastMessageStatus: 'unread',
      lastMessageText: eventData.message,
      lastMessageTime: eventData.timestamp,
      missedMessagesCount: 0,
      name: dialog[0],
      type: 'dialog',
      verified: false,
      lastMessageAuthor: '',
      photoUrl: dialog[1],
    }
    const [chats, chat] = this.toTop(
      (await this.state.storage.get<ChatList>('chatList')) || [],
      chatId,
      chatChanges,
    )
    chats.unshift(chat)
    await this.state.storage.put('chatList', chats)
    return { success: true, eventId, chatId, chats }
  }

  private toTop(
    chats: ChatList,
    chatId: string,
    eventData: Partial<ChatListItem>,
  ): [ChatList, ChatListItem] {
    const currentChatIndex = chats.findIndex(chat => chat.id === chatId)
    const currentChat: ChatListItem =
      currentChatIndex === -1
        ? (eventData as ChatListItem)
        : { ...chats[currentChatIndex], ...eventData }
    if (currentChatIndex >= 0) chats.splice(currentChatIndex, 1)

    return [chats, currentChat]
  }

  async editMessage(request: Request) {
    const { new, timestamp } = await request.json<EditMessageEvent>()
    const event = await this.state.storage.get<EditMessageEvent>(`event-${timestamp}`)
    if (!event) {
      return new Response('Event not found', { status: 404 })
    }
    event.new = new
    await this.state.storage.put(`event-${timestamp}`, event)
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

  ////////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////////

  async online(ws: WebSocket) {
    const chatList = await this.state.storage.get<ChatList>('chatList')
    console.log({ chatList: chatList?.length })
    if (!chatList) {
      return
    }

    for (const chat of chatList) {
      if (chat.type !== 'dialog') {
        continue
      }

      const receiverDOId = this.env.USER_MESSAGING_DO.idFromName(chat.id)
      const receiverDO = this.env.USER_MESSAGING_DO.get(receiverDOId)

      const chatStatus = await (
        await receiverDO.fetch(
          new Request(`${this.#origin}/${chat.id}/online`, {
            method: 'POST',
            body: JSON.stringify({ type: 'online', userId: this.userId }),
          }),
        )
      ).text()

      if (chatStatus === 'online') {
        ws.send(JSON.stringify({ type: 'online', userId: chat.id }))
      }
    }
    this.lastPing = Date.now()
  }

  async offline() {
    // this.state.setWebSocketAutoResponse()
    const chatList = await this.state.storage.get<ChatList>('chatList')
    for (const chat of chatList!) {
      if (chat.type !== 'dialog') {
        continue
      }
      const receiverDOId = this.env.USER_MESSAGING_DO.idFromName(chat.id)
      const receiverDO = this.env.USER_MESSAGING_DO.get(receiverDOId)

      await receiverDO.fetch(
        new Request(`${this.#origin}/${chat.id}/offline`, {
          method: 'POST',
          body: JSON.stringify({ type: 'offline', userId: this.userId }),
        }),
      )
    }
  }

  ////////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////////

  async userSocket(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade')
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return errorResponse('Durable Object expected Upgrade: websocket', 426)
    }
    const webSocketPair = new WebSocketPair()
    const [client, server] = Object.values(webSocketPair)

    this.state.acceptWebSocket(server, ['user'])
    this.server = server
    this.state.waitUntil(this.online(server))

    this.state.storage.setAlarm(Date.now() + 3000)
    // this.state.setWebSocketAutoResponse(
    //   // @ts-ignore
    //   new WebSocketRequestResponsePair(PING, PONG),
    // )
    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  ////////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////////

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    console.log({ f: 'websocketMessage', message })
    const [tag] = this.state.getTags(ws) as Tag[]
    console.log({ tag })
    switch (message) {
      case PING:
        this.lastPing = Date.now()
        // ws.send(PONG)
        break
      default:
        try {
          const event = JSON.parse(message as string) as Event
          await this.handleEvent(ws, event)
        } catch (e) {
          ws.send(JSON.stringify(e))
          console.error(e)
        }
        break
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ): Promise<void> {
    const [tag] = this.state.getTags(ws) as Tag[]
    console.log({ f: 'webSocketClose', code, reason, wasClean, tag })

    await this.offline()

    ws.close()
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error(error)

    try {
      await this.offline()
    } catch (e) {
      console.error(e)
      return
    }
    try {
      ws.close()
    } catch (e) {
      console.error(e)
      return
    }
  }

  ////////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////////

  async handleEvent(ws: WebSocket, event: Event): Promise<void> {
    const eventId = ((await this.state.storage.get<number>('eventIdCounter')) || 0) + 1
		event.timestamp = Date.now()

    await this.state.storage.put(`event-${eventId}`, event)
    await this.state.storage.put('eventIdCounter', eventId)
    switch (event.type) {
      case 'new':
        ws.send(JSON.stringify(await this.sendMessage(eventId, event)))

        break
    }
  }

  userId = ''
  #origin = ''
  #dialogNameCaches = new Map<string, [string, string?]>()
}
type Tag = 'internal' | 'user'
