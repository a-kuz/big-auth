import { ClientEventType, ClientRequestType } from '.'
import { dlt, dlvrd, edit, nw, read, typing } from './event-literals'

import { Profile } from '~/db/models/User'
import { Attachment } from '../Attachment'
import { ChatMessage } from '../ChatMessage'
import { UserId } from './internal'

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
        ? DeleteRequest
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
  id: string
}

export interface NewMessageRequest {
  chatId: string
  message: string
  attachments?: Attachment[]
  clientMessageId: string
  replyTo?: number
  forwarded?: boolean
}

export interface ReplyTo {
  messageId: number
  deletedAt?: number
  clientMessageId: string
  message?: string
  sender: string
  createdAt: number
}

export interface GetChatRequest {
  chatId: string
}

export interface GetChatsRequest {}

export interface GetMessagesRequest {
  chatId: string
  endId?: number
  startId?: number
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
  originalMessageId: number
  clientMessageId: string
  message: string
  attachments?: Attachment[]
}

export interface DeleteRequest {
  chatId: string
  originalMessageId: number
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
export interface NewCallRequest {
  chatId: string
  callId: string
  userId: string
  participantsInvited: string[]
}
export interface CloseCallRequest {
  chatId: string
  callId: string
  userIdCreateCall: string
  participantsInvited: string[]
  participantsConnected: string[]
}
