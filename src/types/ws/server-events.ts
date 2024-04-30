import { ServerEventType } from '.'
import { AttachmentType, Attachment } from './attachments'
import { ServerEventPayload } from './payload-types'

export interface WebsocketServerEvent<Event extends ServerEventType = ServerEventType> {
  type: 'event'
  timestamp: number
  id?: number
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
}

export interface OfflineEvent {
  userId: string
}

export interface TypingServerEvent {
  userId?: string
  chatId: string
}

export interface NewMessageEvent<A extends AttachmentType | never = never> {
  chatId: string
  userId?: string
  message: string
  timestamp?: number
  attachments?: Attachment<A>[]
}

export interface MarkDeliveredEvent {
  chatId: string
	userId?: string
  messageId: number,
	timestamp: number
}
export interface MarkReadEvent {
  chatId: string
	userId?: string
  messageId: number,
	timestamp: number
}

