import { Attachment } from './Attachment'
import { MessageStatus } from './ChatList'
import { ReplyTo } from './ws/client-requests'
import { call, dlt, edit, nw } from './ws/event-literals'

interface Delivering {
  userId: string
  dlvrd?: number
  read?: number
}

export type MessageType = 'new' | 'edit' | 'delete' | call
export type CallDirectionType = 'incoming' | 'outcoming' 
export type CallStatusType = 'missed' | 'received' 
export type CallType = 'video' | 'audio' 

export type EditPayload = {
  originalMessageId: number
}
export type CallOnMessage = {
  direction: CallDirectionType
  status?: CallStatusType
  callType: CallType
}
export type CallPayload = {
  callId: string
  caller: string
  participants?: string[]
  callType: CallType
  callDuration: number
}
export type DeletionPayload = {
  originalMessageId: number
}

export interface StoredDialogMessage {
  messageId: number
  clientMessageId: string
  sender: string
  
  message?: string
  attachments?: Attachment[]
  
  replyTo?: ReplyTo
  forwarded?: boolean
  
  type?: MessageType
  payload?:  EditPayload | DeletionPayload | CallPayload
  
  
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
  forwarded?: boolean
  
  status?: MessageStatus
  
  
  type?: nw | dlt | edit | call
  call?: CallOnMessage

  createdAt: number
  updatedAt?: number
}

export interface GroupChatMessage {
  messageId: number
  clientMessageId: string
  message?: string
  sender: string
  replyTo?: ReplyTo
  type?: MessageType
  payload?:  EditPayload | DeletionPayload
  attachments?: Attachment[]
  delivering?: Delivering[]
  createdAt: number
  updatedAt?: number
  deletedAt?: number
  call?: CallOnMessage
}
export interface StoredGroupMessage {
  messageId: number
  clientMessageId: string
  sender: string
  message?: string
  attachments?: Attachment[]
  
  replyTo?: ReplyTo
  //forwardedFrom?: ForwardedFrom
  
  type?: MessageType
  payload?:  EditPayload | DeletionPayload | CallPayload
  delivering?: Delivering[]
  
  createdAt: number
  updatedAt?: number
  deletedAt?: number
}

export type ChatMessage = DialogMessage | GroupChatMessage
