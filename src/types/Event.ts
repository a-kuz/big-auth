export interface BaseEvent {
  type: string;
  timestamp: number;
  userId: string;
}

export interface NewMessageEvent extends BaseEvent {
  type: "newMessage";
  senderId: string;
  receiverId: string;
  message: string;
  messageId?: number;
}

export interface EditMessageEvent extends BaseEvent {
  type: "editMessage";
  messageId: number;
  newMessage: string;
}

export interface ReadMessageEvent extends BaseEvent {
  type: "readMessage";
  messageId: number;
  readerId: string;
}

export type Event = NewMessageEvent | EditMessageEvent | ReadMessageEvent;
