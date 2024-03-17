// Определение базового типа для всех событий
export interface BaseEvent {
  type: string;
  timestamp: number;
}

// Определение события нового сообщения
export interface NewMessageEvent extends BaseEvent {
  type: 'newMessage';
  senderId: string;
  receiverId: string;
  message: string;
  messageId: string; // Уникальный идентификатор сообщения
}

// Определение события редактирования сообщения
export interface EditMessageEvent extends BaseEvent {
  type: 'editMessage';
  messageId: string; // Уникальный идентификатор редактируемого сообщения
  newMessage: string; // Новый текст сообщения
}

// Определение события чтения сообщения
export interface ReadMessageEvent extends BaseEvent {
  type: 'readMessage';
  messageId: string; // Уникальный идентификатор прочитанного сообщения
  readerId: string; // Идентификатор пользователя, прочитавшего сообщение
}

// Общий тип Event, объединяющий все типы событий
export type Event = NewMessageEvent | EditMessageEvent | ReadMessageEvent;
