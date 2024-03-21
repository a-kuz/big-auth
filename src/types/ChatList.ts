export type ChatType = "dialog" | "group" | "channel" | "favorites";

export type MessageStatus = "read" | "unread";

export interface ChatListItem {
  type: ChatType;
  id: string;
  photoUrl?: string; // необязательное поле
  name: string;
  lastMessageText: string;
  lastMessageTime: Date; // Используйте тип Date для DateTime
  lastMessageAuthor?: string; // необязательное поле
  lastMessageStatus: MessageStatus;
  missedMessagesCount: number;
  verified: boolean;
}

export type ChatList = ChatListItem[];
