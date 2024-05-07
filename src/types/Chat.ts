import { AttachmentType } from './Attachment'
import { ChatType, MessageStatus } from './ChatList'

export type GroupChat = {
  id: string
  name: string
  imgUrl: string
  participants: string[]
  createdAt: number
}

export interface DialogMeta {
  firstName?: string
  lastName?: string
  username?: string
  phoneNumber?: string
}

export interface GroupMeta {
  name: string
  owner: string
  participants: string[]
  createdAt: number
}

// Meta can be either DialogMeta or GroupMeta
type Meta = DialogMeta | GroupMeta

export interface Chat<T extends ChatType>{
  chatId: string
  photoUrl?: string
  type:  ChatType
	name: string;
  lastMessageId: number;
  lastMessageText?: string;
  lastMessageTime?: number;
  lastMessageAuthor?: string;
  lastMessageStatus?: MessageStatus;
  missed: number;
  verified?: boolean;
  isMine?: boolean;
	attachmentType?: AttachmentType
	meta: T extends 'dialog'
  ? DialogMeta
  : T extends 'group'
	? GroupMeta : never

}

export interface Dialog extends Chat<'dialog'> {

}
export interface Group extends Chat<'group'> {

}


