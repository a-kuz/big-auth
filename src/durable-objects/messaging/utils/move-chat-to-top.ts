import { ChatList, ChatListItem } from "~/types/ChatList"

export const toTop = (
  chats: ChatList,
  chatId: string,
  eventData: Partial<ChatListItem>,
): [ChatList, ChatListItem] =>  {
  const currentChatIndex = chats.findIndex(chat => chat.id === chatId)
  const currentChat: ChatListItem =
    currentChatIndex === -1
      ? (eventData as ChatListItem)
      : { ...chats[currentChatIndex], ...eventData }
  if (currentChatIndex >= 0) chats.splice(currentChatIndex, 1)

  return [chats, currentChat]
}


