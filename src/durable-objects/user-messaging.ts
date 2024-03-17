import { Env } from "../types/Env";
import { EditMessageEvent, NewMessageEvent } from "../types/events";

export class UserMessagingDO implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  // Метод для обработки запросов к Durable Object
  async fetch(request: Request) {
    const url = new URL(request.url);
    switch (url.pathname) {
      case "/m/send":
        return this.sendMessage(request);
      case "/m/edit":
        return this.editMessage(request);
      // Добавьте другие case для обработки разных событий
      default:
        return new Response("Not found", { status: 404 });
    }
  }

  // Метод для отправки сообщения
  async sendMessage(request: Request) {
    const eventData = await request.json<NewMessageEvent>();
    // Генерация ID события (можно использовать timestamp или инкрементальный счетчик)
		const currentEventId = (await this.state.storage.get<number>("eventIdCounter")) || 0;
    const newEventId = currentEventId + 1;

    // Сохранение события с новым инкрементальным ID
    await this.state.storage.put(`event-${newEventId}`, eventData);

    // Обновление счетчика в storage
    await this.state.storage.put("eventIdCounter", newEventId);

    return new Response(JSON.stringify({ success: true, newEventId }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Метод для редактирования сообщения
  async editMessage(request: Request) {
    const { eventId, newText } = await request.json();
    // Получение события из state
    const event = await this.state.storage.get<EditMessageEvent>(`event-${eventId}`);
    if (!event) {
      return new Response("Event not found", { status: 404 });
    }
    // Обновление события
    event.newMessage = newText;
    await this.state.storage.put(`event-${eventId}`, event);
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Добавьте дополнительные методы для обработки других событий чата
}
