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

export class UserMessagingDO implements DurableObject {
	public server?: WebSocket
	id = newId(3)
	constructor(
		private readonly state: DurableObjectState,
		private readonly env: Env,
	) {
		console.log({ uuid: this.id, id: state.id })
		this.state.setWebSocketAutoResponse(
			// @ts-ignore
			new WebSocketRequestResponsePair(new Uint8Array([30]).buffer, new Uint8Array([31]).buffer),
		)
		this.state.setHibernatableWebSocketEventTimeout(5000)
	}

	alarm(): void | Promise<void> { }

	async fetch(request: Request) {
		const url = new URL(request.url)
		const paths = url.pathname
			.split('/')
			.filter(p => p)
			.slice(-2)
		this.userId = paths[0]
		const action = paths[1]
		this.#origin = url.origin
		console.log({
			f: 'fetch',
			id: this.id,
			url: request.url,
			userId: this.userId,
			server: this.server,
			wss: this.state.getWebSockets(),
		})

		switch (action) {
			case 'websocket':
				return this.userSocket(request)
			case 'internal-websocket':
				return this.internalSocket(request)
			case 'online':
				return this.friendOnline(request)
			case 'offline':
				return this.friendOffline(request)
			case 'send':
				return this.dialogMessage(request)
			case 'receive':
				return this.dialogMessage(request)
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

		if (eventData.receiverId === eventData.senderId || eventData.receiverId === '0')
			return this.sendToFavorites(eventId, eventData)
		else if (eventData.receiverId === this.userId) return this.receiveMessage(eventId, eventData)
		else return this.sendMessage(eventId, eventData)
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
				lastMessageTime: new Date(eventData.timestamp),
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
		const [chats, chat] = this.toTop(
			(await this.state.storage.get<ChatList>('chatList')) || [],
			chatId,
			{
				id: chatId,
				lastMessageStatus: 'unread',
				lastMessageText: eventData.message,
				lastMessageTime: new Date(eventData.timestamp),
				name: eventData.receiverId,
				type: 'dialog',
				verified: false,
				lastMessageAuthor: chatId,
			},
		)
		chat.missedMessagesCount = (chat.missedMessagesCount ?? 0) + 1
		chats.unshift(chat)
		await this.state.storage.put('chatList', chats)
		return new Response(JSON.stringify({ success: true, eventId }), {
			headers: { 'Content-Type': 'application/json' },
		})
	}

	async sendMessage(eventId: number, eventData: NewMessageEvent) {
		const chatId = eventData.receiverId
		const [chats, chat] = this.toTop(
			(await this.state.storage.get<ChatList>('chatList')) || [],
			chatId,
			{
				id: chatId,
				lastMessageStatus: 'unread',
				lastMessageText: eventData.message,
				lastMessageTime: new Date(eventData.timestamp),
				missedMessagesCount: 0,
				name: eventData.receiverId,
				type: 'dialog',
				verified: false,
				lastMessageAuthor: '',
			},
		)
		chats.unshift(chat)
		await this.state.storage.put('chatList', chats)
		return new Response(JSON.stringify({ success: true, eventId, chatId, chats }), {
			headers: { 'Content-Type': 'application/json' },
		})
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
		const { newMessage, timestamp } = await request.json<EditMessageEvent>()
		const event = await this.state.storage.get<EditMessageEvent>(`event-${timestamp}`)
		if (!event) {
			return new Response('Event not found', { status: 404 })
		}
		event.newMessage = newMessage
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

	async online() {
		const chatList = await this.state.storage.get<ChatList>('chatList')
		console.log({ chatList: chatList?.length })
		if (!chatList) {
			return
		}

		for (const chat of chatList) {
			if (chat.type !== 'dialog') {
				continue
			}
			if (chat.id === this.userId) {
				continue
			}
			const receiverDOId = this.env.USER_MESSAGING_DO.idFromName(chat.id)
			const receiverDO = this.env.USER_MESSAGING_DO.get(receiverDOId)

			// const chatSocket = await receiverDO.fetch(
			//   new Request(`${this.#origin}/websocket/${chat.id}/internal-websocket`, {
			//     method: 'GET',
			//   }),
			// )
			const chatStatus = await (
				await receiverDO.fetch(
					new Request(`${this.#origin}/${chat.id}/online`, {
						method: 'POST',
						body: JSON.stringify({ type: 'online', userId: this.userId }),
					}),
				)
			).text()

			// chatSocket.webSocket?.accept()
			// this.server?.addEventListener('close', event => {
			//   chatSocket.webSocket?.send(JSON.stringify({ type: 'offline', userId: this.userId }))
			// })

			await this.fetch(
				new Request(`${this.#origin}/${this.userId}/${chatStatus}`, {
					method: 'POST',
					body: JSON.stringify({ type: chatStatus, userId: chat.id }),
				}),
			)
			// this.server?.send(JSON.stringify({ userId: chat.id, type: chatStatus }))

			//this.state.acceptWebSocket(f.webSocket!, ["internal"]);

			// chatSocket.webSocket?.send(JSON.stringify({ type: 'online', userId: this.userId }))
			// this.sockets.set(chat.id, chatSocket.webSocket!)
		}
	}

	async offline() {
		const chatList = await this.state.storage.get<ChatList>('chatList')
		for (const chat of chatList!) {
			if (chat.type !== 'dialog') {
				continue
			}
			const receiverDOId = this.env.USER_MESSAGING_DO.idFromName(chat.id)
			const receiverDO = this.env.USER_MESSAGING_DO.get(receiverDOId)

			// const chatSocket = await receiverDO.fetch(
			//   new Request(`${this.#origin}/websocket/${chat.id}/internal-websocket`, {
			//     method: 'GET',
			//   }),
			// )
			const chatStatus = await (
				await receiverDO.fetch(
					new Request(`${this.#origin}/${chat.id}/offline`, {
						method: 'POST',
						body: JSON.stringify({ type: 'online', userId: this.userId }),
					}),
				)
			).text()

			//this.state.acceptWebSocket(f.webSocket!, ["internal"]);

			// chatSocket.webSocket?.send(JSON.stringify({ type: 'online', userId: this.userId }))
			// this.sockets.set(chat.id, chatSocket.webSocket!)
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
		this.state.waitUntil(this.online())

		return new Response(null, {
			status: 101,
			webSocket: client,
		})
	}

	async internalSocket(request: Request): Promise<Response> {
		const upgradeHeader = request.headers.get('Upgrade')
		if (!upgradeHeader || upgradeHeader !== 'websocket') {
			return errorResponse('Durable Object expected Upgrade: websocket', 426)
		}
		const webSocketPair = new WebSocketPair()
		const [client, server] = Object.values(webSocketPair)

		this.state.acceptWebSocket(server, ['internal'])

		return new Response(null, {
			status: 101,
			webSocket: client,
		})
	}

	////////////////////////////////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////////

	async internalMessage(ws: WebSocket, message: string) {
		try {
			const event: Event = JSON.parse(message)
			const [u = undefined] = this.state.getWebSockets('user')

			switch (event.type) {
				case 'online':
					if (u) {
						u.send(JSON.stringify({ type: 'online', userId: event.userId }))
						ws.send(JSON.stringify({ type: 'online', userId: this.userId }))
					} else {
						ws.send(JSON.stringify({ type: 'offline', userId: this.userId }))
					}
					break
				case 'offline':
					if (u) {
						u.send(JSON.stringify({ type: 'offline', userId: event.userId }))
					}
			}
		} catch (e) {
			console.error(e)
			return
		}
	}

	////////////////////////////////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////////

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		console.log({ f: 'websocketMessage', message })
		const [tag] = this.state.getTags(ws) as Tag[]
		console.log({ tag })
		switch (tag) {
			case 'internal':
				await this.internalMessage(ws, message as string )
				break
			case 'user':
				switch (message) {

					case Uint8Array.from([31]).buffer:

						break;
				}

		// await this.internalMessage(ws, message)
				break
      default:
				break;
			}


  }

  async webSocketClose(
	ws: WebSocket,
	code: number,
	reason: string,
	wasClean: boolean,
): Promise < void> {
	const [tag] = this.state.getTags(ws) as Tag[]
    console.log({ f: 'webSocketClose', code, reason, wasClean, tag })
    switch(tag) {
      case 'internal':
	break
      case 'user':
	await this.offline()
}
ws.close()
  }

webSocketError(ws: WebSocket, error: unknown): void | Promise < void> {
	console.error(error)
    try {
		ws.close(0, "")
	} catch(e) {
		console.error(e)
		return
	}
}

userId = ''
#origin = ''
sockets: Map<string, WebSocket> = new Map()
}
type Tag = 'internal' | 'user'
