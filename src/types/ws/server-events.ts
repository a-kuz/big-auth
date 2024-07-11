import { ServerEventType } from '.'
import { Attachment, AttachmentType } from '../Attachment'
import { ForwardedFrom, ReplyTo } from './client-requests'
import { ServerEventPayload } from './payload-types'

export interface ServerEvent<Event extends ServerEventType = ServerEventType> {
  type: 'event'
  timestamp: number
  id?: string
  eventType: Event
  payload: ServerEventPayload
}

export interface EditMessageEvent {
  chatId: string
  userId?: string
  messageId: number
  message: string
}

export interface DeleteEvent {
  chatId: string
  messageId: number
  originalMessageId: number
}

export interface OnlineEvent {
  userId: string
  lastSeen?: number
}
export interface ChatsEvent {}

export interface OfflineEvent {
  userId: string
  lastSeen: number
}

export interface TypingServerEvent {
  userId?: string
  chatId: string
}

export interface NewMessageEvent<A extends AttachmentType | never = never> {
  chatId: string
  sender: string
  replyTo?: ReplyTo
  forwardedFrom?: ForwardedFrom

  message?: string
  senderName?: string
  timestamp: number
  attachments?: Attachment<A>[]
  messageId: number
  clientMessageId: string
  missed?: number
}
export interface NewVOIPEvent<A extends AttachmentType | never = never> {
  appId: string
  callId?: string
  chatId: string
  uid: number
  token?: string
  title: string
  isVideo: boolean
  isGroup: boolean
  type: string
}
export interface MarkDeliveredEvent {
  chatId: string
  userId?: string
  messageId: number
  clientMessageId: string
  timestamp: number
}
export interface MarkReadEvent {
  chatId: string
  userId?: string
  messageId: number
  clientMessageId: string
  timestamp: number
}
