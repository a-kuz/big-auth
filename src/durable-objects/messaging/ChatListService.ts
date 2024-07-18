import { getUserById } from '~/db/services/get-user'
import { displayName } from '~/services/display-name'
import { Dialog, Group } from '~/types/Chat'
import { ChatList, ChatListItem } from '~/types/ChatList'
import { Env } from '~/types/Env'
import { UpdateChatInternalEvent } from '~/types/ws/internal'
import { ContactsManager } from './ContactsManager'
import { chatStorage, chatType, isGroup } from './utils/mdo'
import { WebSocketGod } from './WebSocketService'

export class ChatListService {
  public chatList: ChatList = [] // memory access optimization
  #chatListTimer: NodeJS.Timeout | undefined
  #storage!: DurableObjectStorage
  contacts!: ContactsManager

  constructor(
    private state: DurableObjectState,
    private env: Env,
    private wsService: WebSocketGod,
  ) {
    this.#storage = this.state.storage
  }

  async initialize() {
    this.chatList = (await this.#storage.get<ChatList>('chatList')) || []
    await this.contacts.initialize()
    await this.contacts.loadChatList()
  }

  async save() {
    if (this.#chatListTimer) clearTimeout(this.#chatListTimer)

    this.#chatListTimer = setTimeout(async () => {
      this.chatList = this.chatList.filter(
        (e, i) => this.chatList.findIndex(chat => chat.id == e.id) === i,
      )
      await this.#storage.put('chatList', this.chatList)
    }, 1000)
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

  async updateChat(eventData: UpdateChatInternalEvent, noPatch = false) {
    const { chatId } = eventData
    let name = eventData.name!
    const index = this.chatList.findIndex(chat => chat.id === chatId)
    if (index === -1) return
    if (!isGroup(chatId!) && !noPatch) {
      const contact = await this.contacts.contact(chatId!)
      if (contact) {
        name = displayName(contact)
      }
    }
    this.chatList[index].name = name
    this.chatList[index].photoUrl = eventData.photoUrl || this.chatList[index].photoUrl
    const after = this.env.ENV === 'dev' ? 1 : 1000
    await this.wsService.toBuffer('chats', this.chatList, after, 'chats')
    await this.save()
    return {}
  }
  async chatHandler(chatId: string, userId: string) {
    this.env.userId = userId
    let result: Dialog | Group
    const chatItem = this.chatList.find(chat => chat.id === chatId)
    if ((chatItem && chatItem.lastMessageTime) || chatId.toLowerCase() === 'ai') {
      const chatStub = chatStorage(this.env, chatId, this.env.user.id)
      const chatData = await chatStub.chat(userId)
      result = await this.contacts.patchChat(chatId, chatData)
    } else {
      const user = (await getUserById(this.env.DB, chatId)).profile()
      const patchedUser = await this.contacts.patchProfile(user)
      result = {
        chatId,
        type: chatType(chatId),
        name: displayName(patchedUser),
        photoUrl: patchedUser.avatarUrl,
        missed: 0,

        meta: {
          ...patchedUser,
        },
      }
      const chatListItem: ChatListItem = {
        ...result,
        missed: 0,
        lastMessageTime: 0,
        lastMessageText: '',

        lastMessageStatus: 'undelivered',
        lastMessageId: 0,
        id: result.chatId,
        type: 'dialog',
        isMine: false,
      }
      this.wsService.toBuffer('chats', [...this.chatList, chatListItem], 1)
    }
    return result
  }
}
