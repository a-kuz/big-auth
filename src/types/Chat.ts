import { Profile } from '~/db/models/User'
import { AttachmentType } from './Attachment'
import { MessageStatus } from './ChatList'

// Meta can be either DialogMeta or GroupMeta
type Meta = DialogMeta | GroupMeta

export interface Chat<T extends ChatType> {
  chatId: string
  photoUrl?: string
  type: ChatType
  name: string
  lastMessageId: T extends 'dialog' ? number : T extends 'group' ? number | undefined : never
  lastMessageText?: string
  lastMessageTime?: number
  lastMessageAuthor?: string
  lastMessageStatus?: MessageStatus
  missed: number
  verified?: boolean
  isMine?: boolean
  attachmentType?: AttachmentType
  meta: T extends 'dialog'
    ? DialogMeta
    : T extends 'group'
      ? GroupMeta
      : T extends 'ai'
        ? AiMeta
        : never
}

export interface Dialog extends Chat<'dialog'> {}
export interface Group extends Chat<'group'> {}
export interface DialogAI extends Chat<'ai'> {}

export type GroupChat = {
  id: string
  name: string
  imgUrl: string
  participants: string[]
  createdAt: number
}

// Define types for the 'type' field which can only be one of these specific strings
type ChatType = 'dialog' | 'group' | 'channel' | 'ai' | 'favorotes'

// Define interfaces for Meta, DialogMeta, and GroupMeta
export interface DialogMeta {
  firstName?: string
  lastName?: string
  username?: string
  phoneNumber?: string
}
export interface AiMeta {
  firstName?: string
  lastName?: string
  username?: string
  phoneNumber?: string
}

export interface GroupMeta {
  name: string
  owner: string
  participants: Profile[] | string[] // TODO
  createdAt: number
}

// export interface DialogAI {
//   chatId: string
//   lastMessageId: number
//   photoUrl: string
//   type: string
//   missed: number
//   lastMessageText: string | undefined
//   lastMessageTime: number
//   lastMessageAuthor: string
//   lastMessageStatus: string
//   isMine: boolean
//   name: string
// }
