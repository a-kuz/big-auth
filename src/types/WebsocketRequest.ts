import { BaseEvent, IncomingEvent } from './Event'

export interface WebsocketClientRequest<Event = ClientEventType> {
  type: 'request'
  timestamp: number
  id: string
  payloadType: Event
  payload: ClientReqestPayload
}

export interface WebsocketServerAccept {
  type: 'accept'
  timestamp: number
  id: string
  payload: ServerResponsePayload
}

export interface WebsocketServerEvent<Event = ServerEventType> {
  type: 'event'
  timestamp: number
  id: string
  eventType: Event
  payload: ServerEventPayload
}

export type NewMessage = 'newMessage'
export type EditMessage = 'edit'
export type ReadMessage = 'read'

export interface NewMessageEvent {
  chatId: string
  messageId: number
  message: string
}

export interface EditMessageEvent {
  chatId: string
  messageId: number
  message: string
}

export interface DeleteMessageEvent {
  chatId: string
  messageId: number
}

export interface NewMessageRequest {
  chatId: string
  message: string
}

export interface EditMessageRequest {
  chatId: string
  messageId: number
  message: string
}

export interface DeleteMessageRequest {
  chatId: string
  messageId: number
}

export interface NewMessageResponse {
  messageId: number
}

export interface EditMessageResponse {}

export interface DeleteMessageResponse {}

export type ClientReqestPayload = NewMessageRequest | EditMessageRequest | DeleteMessageRequest
export type ServerResponsePayload = NewMessageResponse | EditMessageResponse | DeleteMessageResponse
export type ServerEventPayload = NewMessageEvent | EditMessageEvent | DeleteMessageEvent

export type ClientEventType = NewMessage | EditMessage | ReadMessage
export type ServerEventType = NewMessage | EditMessage | ReadMessage
