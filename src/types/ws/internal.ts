import { Attachment } from '../Attachment'
import { Chat } from '../Chat'
import { chats, deleteChat, dlvrd, newChat, nw, read, typing } from './event-literals'

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
  chatId: ChatId
  clientMessageId: string
  sender: UserId
  message?: string
  attachments?: Attachment[]
  messageId: number
  timestamp: number
  missed: number
}

export interface NewChatEvent extends Chat<'group'> {
  chatId: string
}

export interface DeleteChatEvent {
  chatId: string
}

export type InternalEvent =
  | MarkDeliveredInternalEvent
  | MarkReadInternalEvent
  | TypingInternalEvent
  | NewGroupMessageEvent
  | NewChatEvent

export type InternalEventType = nw | chats | typing | read | dlvrd | newChat | deleteChat
export type UserId = string
export type ChatId = string
export type MessageId = number
export type Timestamp = number
