import { getUserById } from '~/db/services/get-user'
import { displayName } from '~/services/display-name'
import { Dialog, Group } from '~/types/Chat'
import { ChatList, ChatListItem } from '~/types/ChatList'
import { Env } from '~/types/Env'
import { UpdateChatInternalEvent } from '~/types/ws/internal'
import { ContactsManager } from './ContactsManager'
import { chatStorage, chatType, isGroup } from './utils/mdo'
import { WebSocketGod } from './WebSocketService'
import { OnlineStatusService } from './OnlineStatusService'
import { newId } from '~/utils/new-id'

export class ChatListService {
  public chatList: ChatList = [] // memory access optimization
  #chatListTimer: NodeJS.Timeout | undefined
  #storage!: DurableObjectStorage
  contacts!: ContactsManager
  onlineService!: OnlineStatusService

  constructor(
    private state: DurableObjectState,
    private env: Env,
    private wsService: WebSocketGod,
  ) {
    this.#storage = this.state.storage
  }

  async initialize() {
    this.chatList = (await this.#storage.get<ChatList>('chatList')) || []
    const removeIt = this.chatList.filter(c=>c.photoUrl==="https://dev.iambig.ai/public/c0c99c272df4a05e0d0303b4a390492c4786432853c0cb974ed75b8b1b80308e" && c.type==="group");
    if (removeIt.length) {

      this.chatList = this.chatList.filter(e=>!removeIt.includes(e))
      this.save()
    }
    await this.contacts.initialize()
    await this.contacts.loadChatList()
  }

  async save() {
    if (this.#chatListTimer) clearTimeout(this.#chatListTimer)

    this.#chatListTimer = setTimeout(async () => {
      this.chatList = this.chatList.filter(
        (e, i) => this.chatList.findIndex(chat => chat.id === e.id) === i,
      )
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
  async chatRequest(chatId: string, userId: string) {
    this.env.userId = userId
    let result: Dialog | Group
    const chatItem = this.chatList.find(chat => chat.id === chatId)
    if ((chatItem && chatItem.lastMessageTime) || chatId === 'AI' || isGroup(chatId)) {
      const chatStub = chatStorage(this.env, chatId, userId)
      const chatData = await chatStub.chat(userId)
      result = await this.contacts.patchChat(chatId, chatData)
    } else {
      const user = (await getUserById(this.env.DB, chatId)).profile()
      const patchedUser = await this.contacts.patchProfile(user)
      const lastSeen = await this.onlineService.lastSeenOf(chatId)
      result = {
        chatId,
        type: 'dialog',
        name: displayName(patchedUser),
        photoUrl: user.avatarUrl,
        missed: 0,

        meta: {
          ...patchedUser,
        },
        lastSeen,
      }
      const chatListItem: ChatListItem = {
        ...result,
        missed: 0,
        lastMessageTime: 0,
        lastMessageText: '',
        photoUrl: patchedUser.avatarUrl,
        lastMessageStatus: 'undelivered',
        lastMessageId: 0,
        id: result.chatId,
        type: 'dialog',
        isMine: false,
        lastMessageAuthor: chatId,

        lastSeen,
      }
      this.wsService.sendPacket({
        eventType: 'chats',
        payload: [chatListItem, ...this.chatList],
        timestamp: Date.now(),
        id: newId(),
        type: 'event',
      })
      this.wsService.toBuffer('chats', [chatListItem, ...this.chatList],1500)
    }
    return result
  }
}
