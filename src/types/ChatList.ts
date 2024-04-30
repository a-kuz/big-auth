export type ChatType = "dialog" | "group" | "channel" | "favorites";

export type MessageStatus = "read" | "unread" | "undelivered";

export interface ChatListItem {
  type: ChatType;
  id: string;
  photoUrl?: string; // необязательное поле
  name: string;
  lastMessageText: string;
  lastMessageTime: number; // Используйте тип Date для DateTime
  lastMessageAuthor?: string; // необязательное поле
  lastMessageStatus: MessageStatus;
  missed: number;
  verified?: boolean;
  isMine: boolean;
  lastMessageId: number;

}

export type ChatList = ChatListItem[];
