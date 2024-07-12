import { ChatList, ChatListItem } from '~/types/ChatList'
import { Env } from '~/types/Env'
import { UpdateChatInternalEvent } from '~/types/ws/internal'
import { isGroup } from './utils/mdo'
import { ContactsManager } from './ContactsManager'
import { WebSocketGod } from './WebSocketService'
import { displayName } from '~/services/display-name'

export class ChatListService {
  public chatList: ChatList = [] // memory access optimization
  #chatListTimer: NodeJS.Timeout | undefined
  #storage!: DurableObjectStorage
  contacts!: ContactsManager
  
  constructor(
    private state: DurableObjectState,
    env: Env,
    private wsService: WebSocketGod
  ) {
    this.#storage = state.storage

    // state.blockConcurrencyWhile(async () => this.initialize())
  }

  async initialize() {
    this.chatList = (await this.#storage.get<ChatList>('chatList')) || []
    await this.contacts.initialize();
    await this.contacts.loadChatList();
  }

  async save() {
    if (this.#chatListTimer) clearTimeout(this.#chatListTimer)
    
    this.#chatListTimer = setTimeout(async () => {
      this.chatList = this.chatList.filter((e, i) => this.chatList.findIndex(chat => chat.id == e.id) === i)
    }, 1000)
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

  async updateChat(eventData: UpdateChatInternalEvent) {
    
    const { chatId, meta, photoUrl } = eventData
    let name = eventData.name!;
    const index = this.chatList.findIndex(chat => chat.id === chatId)
    if (index===-1) return
    if (!isGroup(chatId!)) {
      const contact = await this.contacts.contact(chatId!)
      if (contact) {
        name = displayName(contact)
      }
    }
    this.chatList[index].name = name
    this.chatList[index].photoUrl = photoUrl
    await this.wsService.toBuffer('chats', this.chatList)
    await this.save()
    return {}

  }
}
