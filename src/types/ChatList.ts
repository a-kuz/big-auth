import { AttachmentType } from "./ws/attachments";

export type ChatType = "dialog" | "group" | "channel" | "favorites";

export type MessageStatus = "read" | "unread" | "undelivered";

export interface ChatListItem {
  type: ChatType;
  id: string;
  photoUrl?: string; // необязательное поле
  name: string;
  lastMessageId: number;
  lastMessageText: string;
  lastMessageTime: number;
  lastMessageAuthor?: string;
  lastMessageStatus: MessageStatus;
  missed: number;
  verified?: boolean;
  isMine: boolean;
	attachmentType?: AttachmentType

}

export type ChatList = ChatListItem[];
