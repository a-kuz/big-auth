import { ClientEventType, ClientRequestType } from '.'
import { dlt, edit, dlvrd, read, nw, typing } from './event-literals'

import { Attachment } from './attachments'

export interface WebsocketClientRequest<Type extends ClientRequestType = ClientRequestType> {
  type: 'request'
  timestamp: number
  id: string
  payloadType: Type
  payload: Type extends nw
    ? NewMessageRequest
    : Type extends edit
      ? EditMessageRequest
      : Type extends dlt
        ? DeleteMessageRequest
        : Type extends dlvrd
          ? MarkDeliveredRequest
          : Type extends read
            ? MarkReadRequest
            : never
}

export interface WebsocketClientEvent<Type extends ClientEventType = ClientEventType> {
  type: 'event'
  timestamp: number
  id: string
  payloadType: Type
  payload: Type extends typing ? TypingEvent : never
}

export interface NewMessageRequest {
  chatId: string
  message: string
  attachments?: Attachment[]
}
export interface getChatRequest {
  chatId: string
}
export interface getChatsRequest {}

export interface getMessagesRequest {
  chatId: string
  endId?: number
  count?: number
}

export interface TypingEvent {
  chatId: string
}

export interface EditMessageRequest {
  chatId: string
  messageId: number
  message: string
  attachments?: Attachment[]
}

export interface DeleteMessageRequest {
  chatId: string
  messageId: number
}

export interface MarkReadRequest {
  chatId: string
  messageId: number
}

export interface MarkDeliveredRequest {
  chatId: string
  messageId: number
}
