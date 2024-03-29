import { ChatList, ChatListItem } from "../../types/ChatList";
import { Env } from "../../types/Env";
import { EditMessageEvent, NewMessageEvent } from "../../types/Event";
import { errorResponse } from "../../utils/error-response";
import { internalSocket } from "./internal-socket";
import { userSocket } from "./user-socket";

export class UserMessagingDO implements DurableObject {
  public server?: WebSocket;
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request) {
    const url = new URL(request.url);
    const paths = url.pathname.split("/").filter((p) => p);
    this.userId = paths[0];
    const action = paths[1];
    this.#origin = url.origin;

    switch (action) {
      case "websocket":
        return this.userSocket(request);
      case "internal-websocket":
        return this.internalSocket(request);
      case "send":
        return this.dialogMessage(request);
      case "edit":
        return this.editMessage(request);
      case "chat":
        return this.fetchMessages(request);
      case "chats":
        return this.fetchChats(request);
      default:
        return new Response(`${url.pathname} Not found`, { status: 404 });
    }
  }

  async dialogMessage(request: Request) {
    const eventData = await request.json<NewMessageEvent>();
    const eventId =
      ((await this.state.storage.get<number>("eventIdCounter")) || 0) + 1;

    await this.state.storage.put(`event-${eventId}`, eventData);
    await this.state.storage.put("eventIdCounter", eventId);

    if (
      eventData.receiverId === eventData.senderId ||
      eventData.receiverId === "0"
    )
      return this.sendToFavorites(eventId, eventData);
    else if (eventData.receiverId === this.userId)
      return this.receiveMessage(eventId, eventData);
    else return this.sendMessage(eventId, eventData);
  }

  async sendToFavorites(eventId: number, eventData: NewMessageEvent) {
    const chatId = this.userId;
    const [chats, chat] = this.toTop(
      (await this.state.storage.get<ChatList>("chatList")) || [],
      chatId,
      {
        id: chatId,
        lastMessageStatus: "read",
        lastMessageText: eventData.message,
        lastMessageTime: new Date(eventData.timestamp),
        name: "Favorites",
        type: "favorites",
        verified: false,
        lastMessageAuthor: chatId,
      },
    );
    chat.missedMessagesCount = 0;
    chats.unshift(chat);
    await this.state.storage.put("chatList", chats);

    return new Response(JSON.stringify({ success: true, eventId }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  async receiveMessage(eventId: number, eventData: NewMessageEvent) {
    const chatId = eventData.senderId;
    const [chats, chat] = this.toTop(
      (await this.state.storage.get<ChatList>("chatList")) || [],
      chatId,
      {
        id: chatId,
        lastMessageStatus: "unread",
        lastMessageText: eventData.message,
        lastMessageTime: new Date(eventData.timestamp),
        name: eventData.receiverId,
        type: "dialog",
        verified: false,
        lastMessageAuthor: chatId,
      },
    );
    chat.missedMessagesCount = (chat.missedMessagesCount ?? 0) + 1;
    chats.unshift(chat);
    await this.state.storage.put("chatList", chats);
    return new Response(JSON.stringify({ success: true, eventId }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  async sendMessage(eventId: number, eventData: NewMessageEvent) {
    const chatId = eventData.receiverId;
    const [chats, chat] = this.toTop(
      (await this.state.storage.get<ChatList>("chatList")) || [],
      chatId,
      {
        id: chatId,
        lastMessageStatus: "unread",
        lastMessageText: eventData.message,
        lastMessageTime: new Date(eventData.timestamp),
        missedMessagesCount: 0,
        name: eventData.receiverId,
        type: "dialog",
        verified: false,
        lastMessageAuthor: "",
      },
    );
    chats.unshift(chat);
    await this.state.storage.put("chatList", chats);
    return new Response(
      JSON.stringify({ success: true, eventId, chatId, chats }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  private toTop(
    chats: ChatList,
    chatId: string,
    eventData: Partial<ChatListItem>,
  ): [ChatList, ChatListItem] {
    const currentChatIndex = chats.findIndex((chat) => chat.id === chatId);
    const currentChat: ChatListItem =
      currentChatIndex === -1
        ? (eventData as ChatListItem)
        : { ...chats[currentChatIndex], ...eventData };
    if (currentChatIndex >= 0) chats.splice(currentChatIndex, 1);

    return [chats, currentChat];
  }

  async editMessage(request: Request) {
    const { newMessage, timestamp } = await request.json<EditMessageEvent>();
    const event = await this.state.storage.get<EditMessageEvent>(
      `event-${timestamp}`,
    );
    if (!event) {
      return new Response("Event not found", { status: 404 });
    }
    event.newMessage = newMessage;
    await this.state.storage.put(`event-${timestamp}`, event);
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  async fetchMessages(request: Request) {
    const url = new URL(request.url);
    const chatId = url.searchParams.get("chatId");
    if (!chatId) {
      return new Response("Chat ID is required", { status: 400 });
    }

    const messages = await this.state.storage.list({
      prefix: `chat-${chatId}-message-`,
    });
    const messagesArray = Array.from(messages.values());

    return new Response(JSON.stringify(messagesArray), {
      headers: { "Content-Type": "application/json" },
    });
  }

  async fetchChats(request: Request) {
    const chatList = (await this.state.storage.get<ChatList>("chatList")) || [];
    return new Response(JSON.stringify(chatList), {
      headers: { "Content-Type": "application/json" },
    });
  }

  async userSocket(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader !== "websocket") {
      return errorResponse("Durable Object expected Upgrade: websocket", 426);
    }
    const client = userSocket(this);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
  async internalSocket(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader !== "websocket") {
      return errorResponse("Durable Object expected Upgrade: websocket", 426);
    }
    const client = internalSocket(this);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async online() {
    const chatList = await this.state.storage.get<ChatList>("chatList");
    if (!chatList) {
      return;
    }
    for (const chat of chatList) {
      if (chat.type !== "dialog") {
        continue;
      }
      let socket = this.sockets.get(chat.id);
      if (
        !(
          socket?.readyState === WebSocket.READY_STATE_OPEN ||
          socket?.readyState === WebSocket.OPEN
        )
      ) {
        const receiverDOId = this.env.USER_MESSAGING_DO.idFromName(chat.id);
        const receiverDO = this.env.USER_MESSAGING_DO.get(receiverDOId);

        socket = (
          await receiverDO.fetch(
            new Request(`${origin}/${this.userId}/internal-websocket`),
          )
        ).webSocket!;

        socket.send(`${this.userId} online`);
        this.sockets.set(chat.id, socket);
      }
    }
  }

  async offline() {}

  userId = "";
  #origin = "";
  sockets: Map<string, WebSocket> = new Map();
}
