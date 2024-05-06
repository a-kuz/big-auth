import { Attachment } from '../Attachment'
import { chats, dlvrd, nw, read, typing } from './event-literals'

export interface MarkDeliveredInternalEvent {
  chatId: string
  userId?: string
  messageId: number
  timestamp: number
}
export interface MarkReadInternalEvent {
  chatId: string
  userId?: string
  messageId: number
  timestamp: number
}
export interface TypingInternalEvent {
  userId: string
}

export interface NewGroupMessageEvent {
	chatId: string
  sender: string
  message?: string
  attachments?: Attachment[],
	type: 'group'
}

export type InternalEvent =
  | MarkDeliveredInternalEvent
  | MarkReadInternalEvent
  | TypingInternalEvent | NewGroupMessageEvent



export type InternalEventType = nw | chats | typing | read | dlvrd
