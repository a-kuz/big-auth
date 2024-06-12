import { ClientEventType, ClientRequestType } from '.'
import { dlt, edit, dlvrd, read, nw, typing } from './event-literals'

import { Attachment } from '../Attachment'
import { UserId } from './internal'
import { ChatMessage } from '../ChatMessage'
import { Profile, User } from '~/db/models/User'

export interface ClientRequest<Type extends ClientRequestType = ClientRequestType> {
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

export interface ClientEvent<Type extends ClientEventType = ClientEventType> {
  type: 'event'
  timestamp: number
  id: string
  payloadType: Type
  payload: Type extends typing ? TypingClientEvent : never
}

export interface ClientAccept {
  type: 'ack'
  id: number
}

export interface NewMessageRequest {
  chatId: string
  message: string
  attachments?: Attachment[]
  clientMessageId: string
}
export interface GetChatRequest {
  chatId: string
}

export interface GetChatsRequest {}

export interface GetMessagesRequest {
  chatId: string
  endId?: number
  count?: number
}

export type GetMessagesResponse = {
  messages: ChatMessage[]
  authors: Profile[]
}

export interface TypingClientEvent {
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
  messageId?: number
  userId?: UserId
}

export interface MarkDeliveredRequest {
  chatId: string
  messageId?: number
}

export interface CreateChatRequest {
  name: string
  imgUrl: string
  participants: string[]
}
