import { UserMessagingDO } from "./UserMessagingDO";

export const internalSocket = (
  messaging: UserMessagingDO,
	userId: string
): WebSocket => {
  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);

  server.accept();

  server.addEventListener("message", (event: MessageEvent) => {
    messaging.server?.send(event.data)
		server.send(`${userId} online`);
  });

  server.addEventListener("open", (event: Event) => {
    // messaging.online();
    server.send(`${userId} online`);
  });

  // setInterval(() => {
  //   try {
  //     server.send(`ping`);
  //   } catch (e) {
  //     console.error(e);
  //     messaging.offline();
  //   }
  // }, 3000);

  // If the client closes the connection, the runtime will close the connection too.
  server.addEventListener("close", (cls: CloseEvent) => {
    // messaging.offline();
		server.send(`${userId} offline`);

    server.close(cls.code);
  });
  return client;
};
