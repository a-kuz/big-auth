export interface BaseEvent<S = EventType> {
  type: S;
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

export interface OnlineEvent extends BaseEvent<Online> {
  type: "online";
}
export interface OfflineEvent extends BaseEvent<Offline> {
  type: "offline";
}

export type Event =
  | NewMessageEvent
  | EditMessageEvent
  | ReadMessageEvent
  | OnlineEvent
  | OfflineEvent;

export type NewMessageUpdate = "newMessage";
export type Online = "online";
export type Offline = "offline";
export type EventType =
  | "newMessage"
  | "editMessage"
  | "readMessage"
  | "online"
  | "offline";
