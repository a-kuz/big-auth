import { AttachmentType } from './Attachment'

export type ChatType = 'dialog' | 'group' | 'channel' | 'favorites' | 'ai'

export type MessageStatus = 'read' | 'unread' | 'undelivered' | 'deleted'

export interface ChatListItem {
  type: ChatType
  id: string
  name: string
  lastMessageTime: number
  photoUrl?: string 
  lastMessageId?: number
  lastMessageText?: string
  lastMessageAuthor?: string
  lastMessageStatus?: MessageStatus
  missed: number
  firstMissed?: string
  verified?: boolean
  isMine: boolean
  attachmentType?: AttachmentType
	lastSeen?: number
	
}

export type ChatList = ChatListItem[]
