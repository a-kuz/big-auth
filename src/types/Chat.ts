import { ChatType } from './ChatList'

export type GroupChat = {
  id: string
  name: string
  imgUrl: string
  participants: string[]
  createdAt: number
}

interface DialogMeta {
  firstName?: string
  lastName?: string
  username?: string
  phoneNumber?: string
}

interface GroupMeta {
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
  lastMessageId?: number
	meta: T extends 'dialog'
  ? DialogMeta
  : T extends 'group'
    ? GroupMeta

}

export interface Dialog extends Chat<'dialog'> {

}
export interface Group extends Chat<'group'> {

}


