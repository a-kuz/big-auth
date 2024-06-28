import { Attachment } from './Attachment'

export interface Delivering {
  userId: string
  dlvrd?: number
  read?: number
}

export interface DialogMessage {
  messageId: number
  clientMessageId: string
  message?: string
  sender: string
  attachments?: Attachment[]
  read?: number
  dlvrd?: number
  createdAt: number
  updatedAt?: number
  deletedAt?: number
}

export interface GroupChatMessage {
  messageId: number
  clientMessageId: string
  message?: string
  sender: string
  attachments?: Attachment[]
  delivering?: Delivering[]
  createdAt: number
  updatedAt?: number
  deletedAt?: number
}
export type ChatMessage = DialogMessage | GroupChatMessage
