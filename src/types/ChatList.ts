import { AttachmentType } from './Attachment'

export type ChatType = 'dialog' | 'group' | 'channel' | 'favorites' | 'ai'

.

export interface ChatListItem {
  type: ChatType
  id: string
  photoUrl?: string // optional field
  name: string
  lastMessageId: number
  lastMessageText?: string
  lastMessageTime: number
  lastMessageAuthor?: string
  lastMessageStatus: MessageStatus
  missed: number
  verified?: boolean
  isMine: boolean
  attachmentType?: AttachmentType
	lastSeen?: number
	
}

export type ChatList = ChatListItem[]
