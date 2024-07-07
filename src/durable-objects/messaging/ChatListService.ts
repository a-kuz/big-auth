import { ChatList, ChatListItem } from '~/types/ChatList'
import { Env } from '~/types/Env'

export class ChatListService {
  public chatList: ChatList = [] // memory access optimization
  #chatListTimer: NodeJS.Timeout | undefined
  #storage!: DurableObjectStorage
  constructor(
    private state: DurableObjectState,
    env: Env,
  ) {
    this.#storage = state.storage

    state.blockConcurrencyWhile(async () => this.initialize())
  }

  private async initialize() {
    this.chatList = (await this.#storage.get<ChatList>('chatList')) || []
  }

  async save() {
    await this.#storage.put('chatList', this.chatList)
  }

  toTop(chatId: string, eventData: Partial<ChatListItem>): ChatListItem {
    const currentChatIndex = this.chatList.findIndex(chat => chat.id === chatId)
    const currentChat: ChatListItem =
      currentChatIndex === -1
        ? (eventData as ChatListItem)
        : { ...this.chatList[currentChatIndex], ...eventData }
    if (currentChatIndex >= 0) this.chatList.splice(currentChatIndex, 1)

    return currentChat
  }
}
