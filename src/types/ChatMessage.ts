import { Attachment } from './Attachment'
import { MessageStatus } from './ChatList'
import { ForwardedFrom, ReplyTo } from './ws/client-requests'
import { dlt, edit, nw } from './ws/event-literals'

interface Delivering {
  userId: string
  dlvrd?: number
  read?: number
}

type MessageType = 'new' | 'edit' | 'delete' | 'call'

type EditPayload = {
  originalMessageId: number
}

type DeletionPayload = {
  originalMessageId: number
}

export interface StoredDialogMessage {
  messageId: number
  clientMessageId: string
  sender: string
  
  message?: string
  attachments?: Attachment[]
  
  replyTo?: ReplyTo
  forwardedFrom?: ForwardedFrom
  
  type?: nw | edit | dlt
  payload?:  DeletionPayload
  
  createdAt: number
  updatedAt?: number
  deletedAt?: number
}

export interface DialogMessage {
  messageId: number
  clientMessageId: string
  message?: string
  attachments?: Attachment[]
  sender: string
  
  replyTo?: ReplyTo
  forwardedFrom?: ForwardedFrom
  
  read?: number // deprecated
  dlvrd?: number // depracted
  
  status?: MessageStatus
  type?: nw | dlt | edit

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
