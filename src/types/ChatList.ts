import { AttachmentType } from './Attachment'

export type ChatType = 'dialog' | 'group' | 'channel' | 'favorites' | 'ai'

export type MessageStatus = 'read' | 'unread' | 'undelivered' | 'deleted'

export interface ChatListItem {
  type: ChatType
  id: string
  photoUrl?: string // необязательное поле
  name: string
  lastMessageId?: number
  lastMessageText?: string
  lastMessageTime?: number
  lastMessageAuthor?: string
  lastMessageStatus?: MessageStatus
  missed: number
  firstMissed?: string
  verified?: boolean
  isMine?: boolean
  attachmentType?: AttachmentType
	lastSeen?: number
	
}

export type ChatList = ChatListItem[]
