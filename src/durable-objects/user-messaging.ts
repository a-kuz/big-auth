import { ChatList, ChatListItem } from "../types/ChatList";
import { Env } from "../types/Env";
import { BaseEvent, EditMessageEvent, NewMessageEvent } from "../types/Event";

export class UserMessagingDO implements DurableObject {
  public server?: WebSocket;
  constructor(
    private readonly state: DurableObjectState,
    private online: boolean,

    private readonly env: Env,
  ) {}

  async fetch(request: Request) {
    const url = new URL(request.url);
    const paths = url.pathname.split("/").filter((p) => p);
    this.#userId = paths[0];
    const action = paths[1];

    switch (action) {
      case "websocket":
        return this.websocket(request);
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
    else if (eventData.receiverId === this.#userId)
      return this.receiveMessage(eventId, eventData);
    else return this.sendMessage(eventId, eventData);
  }

  async sendToFavorites(eventId: number, eventData: NewMessageEvent) {
    const chatId = this.#userId;
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

  async websocket(request: Request) {
    // Expect to receive a WebSocket Upgrade request.
    // If there is one, accept the request and return a WebSocket Response.
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader !== "websocket") {
      return new Response("Durable Object expected Upgrade: websocket", {
        status: 426,
      });
    }

    // Creates two ends of a WebSocket connection.
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    // Calling `accept()` tells the runtime that this WebSocket is to begin terminating
    // request within the Durable Object. It has the effect of "accepting" the connection,
    // and allowing the WebSocket to send and receive messages.
    server.accept();
    this.server = server;

    // Upon receiving a message from the client, the server replies with the same message,
    // but will prefix the message with "[Durable Object]: ".
    this.server.addEventListener("message", (event: MessageEvent) => {
      server.send(`${event.data}`);
    });
    server.addEventListener("open", (event: Event) => {
      this.online = true;
			server.send(`${this.#userId} online`);
    });

    setInterval(() => {
      try {
        server.send(`ping`);
      } catch (e) {
        console.error(e);
        this.online = false;
      }
    }, 3000);

    // If the client closes the connection, the runtime will close the connection too.
    server.addEventListener("close", (cls: CloseEvent) => {
      this.online = false;

      server.close(cls.code, "bue");
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  #userId = "";
}
