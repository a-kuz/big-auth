import { Attachment } from './Attachment'
import { MessageStatus } from './ChatList'
import { ForwardedFrom, ReplyTo } from './ws/client-requests'

interface Delivering {
  userId: string
  dlvrd?: number
  read?: number
}

type MessageType = 'new' | 'edit' | 'delete' | 'call'

export interface StoredDialogMessage {
  messageId: number
  clientMessageId?: string
  message?: string
  sender: string
  attachments?: Attachment[]

	replyTo?: ReplyTo
	forwardedFrom?: ForwardedFrom

  type: MessageType 

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
