import { Attachment } from '../Attachment'
import { Chat, Dialog, Group } from '../Chat'
import { CallDirectionType, CallStatusType, CallType } from '../ChatMessage'
import { chats, closeCall, deleteChat, dlt, dlvrd, newCall, newChat, nw, read, typing } from './event-literals'
import { DeleteEvent } from './server-events'

export interface MarkDeliveredInternalEvent {
  chatId: string
  userId?: string
  messageId: number
  clientMessageId: string
  timestamp: number
}
export type UpdateChatInternalEvent = Partial<Dialog | Group>
export interface MarkReadInternalEvent {
  chatId: string
  userId?: string
  messageId: number
  clientMessageId: string
  timestamp: number
}
export interface TypingInternalEvent {
  userId: string
  stop?: boolean
}

export interface NewGroupMessageEvent {
  chatId: ChatId
  clientMessageId: string
  sender: UserId
  senderName: string
  message?: string
  attachments?: Attachment[]
  messageId: number
  timestamp: number
  missed: number
  firstMissed?: string
}

export interface NewChatEvent extends Chat<'group'> {
  chatId: string
}
export interface NewCallEvent {
  chatId: string
  callId: string
  createdAt: number
}
export interface CloseCallEvent {
  chatId: string
  callId: string
  callType: CallType
  messageId: number
  status: CallStatusType
  direction: CallDirectionType,
  missed: number,
  firstMissed?: string
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
  | NewCallEvent
  | CloseCallEvent
  | DeleteEvent

export type InternalEventType = nw | chats | typing | read | dlvrd | newChat | deleteChat | newCall | closeCall | dlt
export type UserId = string
export type ChatId = string
export type MessageId = number
export type Timestamp = number
