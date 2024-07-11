import { Attachment } from './Attachment'
import { MessageStatus } from './ChatList'
import { ForwardedFrom, ReplyTo } from './ws/client-requests'

interface Delivering {
  userId: string
  dlvrd?: number
  read?: number
}

type MessageType = 'new' | 'edit' | 'delete' | 'call'

type EditPayload = {
  originalMessageId: number
  message: string
  attachments?: Attachment[]
}
type DeletePayload = {
  originalMessageId: number
}

export interface StoredDialogMessage<T extends MessageType = 'new'> {
  messageId: number
  clientMessageId?: string
  message?: string
  sender: string
  attachments?: Attachment[]

  replyTo?: ReplyTo
  forwardedFrom?: ForwardedFrom

  type?: T

  payload?: T extends 'edit' ? EditPayload : T extends 'delete' ? DeletePayload : undefined

  createdAt: number
  updatedAt?: number
  deletedAt?: number
}

export interface DialogMessage {
  messageId: number
  clientMessageId: string
  message?: string
  sender: string
  replyTo?: ReplyTo
  forwardedFrom?: ForwardedFrom
  attachments?: Attachment[]
  read?: number // deprecated
  dlvrd?: number // depracted
  status?: MessageStatus
  createdAt: number
  updatedAt?: number
}

export interface GroupChatMessage {
  messageId: number
  clientMessageId: string
  message?: string
  sender: string
  replyTo?: ReplyTo
  attachments?: Attachment[]
  delivering?: Delivering[]
  createdAt: number
  updatedAt?: number
  deletedAt?: number
}
export type ChatMessage = DialogMessage | GroupChatMessage
