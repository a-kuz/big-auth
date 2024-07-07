import { ServerEventType } from '.'
import { AttachmentType, Attachment } from '../Attachment'
import { ChatType } from '../ChatList'
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

export interface DeleteMessageEvent {
  chatId: string
  messageId: number
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
  sender?: string
  message?: string
  senderName?: string
  timestamp?: number
  attachments?: Attachment<A>[]
  messageId: number
  clientMessageId?: string
  missed?: number,
  callId?: string
  uid?: number
  token?: string
  appId?: string
}
export interface NewVOIPEvent<A extends AttachmentType | never = never> {
  appId: string
  callId?: string
  chatId: string,
  uid: number
  token?: string
  title: string
  isVideo: boolean,
  isGroup: boolean,
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
