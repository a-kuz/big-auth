import { Attachment } from '../Attachment'
import { Chat, Dialog, Group, GroupChat } from '../Chat'
import { ChatListItem } from '../ChatList'
import { chats, deleteChat, dlvrd, newChat, newCall, nw, read, typing } from './event-literals'

export interface MarkDeliveredInternalEvent {
  chatId: string
  userId?: string
  messageId: number
  clientMessageId: string
  timestamp: number
}
export type UpdateChatInternalEvent = Dialog | Group
export interface MarkReadInternalEvent {
  chatId: string
  userId?: string
  messageId: number
  clientMessageId: string
  timestamp: number
}
export interface TypingInternalEvent {
  userId: string
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
}

export interface NewChatEvent extends Chat<'group'> {
  chatId: string
}
export interface NewCallEvent {
  chatId: string
  callId: string
  createdAt: number
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

export type InternalEventType = nw | chats | typing | read | dlvrd | newChat | deleteChat | newCall
export type UserId = string
export type ChatId = string
export type MessageId = number
export type Timestamp = number
