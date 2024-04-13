export interface BaseEvent<S = EventType> {
  type: S
  timestamp: number
  userId: string
}

export type IncomingEvent<S = EventType> = Exclude<BaseEvent<S>, 'timestamp' | 'userId'>

export interface NewMessageEvent extends BaseEvent<NewMessage> {
  senderId: string
  receiverId: string
  message: string
}

export interface EditMessageEvent extends BaseEvent<EditMessage> {
  messageId: number
  newMessage: string
}

export interface ReadMessageEvent extends BaseEvent<ReadMessage> {
  messageId: number
}

export interface OnlineEvent extends BaseEvent<Online> {
}
export interface OfflineEvent extends BaseEvent<Offline> {
}

export type NewMessage = 'newMessage'
export type EditMessage = 'edit'
export type ReadMessage = 'read'
export type Online = 'online'
export type Offline = 'offline'

export type EventType = 'newMessage' | 'editMessage' | 'readMessage' | 'online' | 'offline'

export type Event =
  | NewMessageEvent
  | EditMessageEvent
  | ReadMessageEvent
  | OnlineEvent
  | OfflineEvent
