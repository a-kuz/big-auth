import { UserMessagingDO } from "./UserMessagingDO";

export const userSocket = (
  messaging: UserMessagingDO,
): WebSocket => {
  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);

  server.accept();
  messaging.server = server;

  messaging.server.addEventListener("message", (event: MessageEvent) => {
    server.send(`${event.data}`);
  });

  server.addEventListener("open", (event: Event) => {
    messaging.online();
    server.send(`${messaging.userId} online`);
  });

  setInterval(() => {
    try {
      server.send(`ping`);
    } catch (e) {
      console.error(e);
      messaging.offline();
    }
  }, 3000);

  // If the client closes the connection, the runtime will close the connection too.
  server.addEventListener("close", (cls: CloseEvent) => {
    messaging.offline();

    server.close(cls.code, "bue");
  });
  return client;
};
