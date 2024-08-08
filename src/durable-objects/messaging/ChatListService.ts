import { getUserById } from '~/db/services/get-user'
import { displayName } from '~/services/display-name'
import { Dialog, DialogAI, Group } from '~/types/Chat'
import { ChatList, ChatListItem } from '~/types/ChatList'
import { Env } from '~/types/Env'
import { UpdateChatInternalEvent } from '~/types/ws/internal'
import { ContactsManager } from './ContactsManager'
import { chatStorage, chatType, gptStorage, isGroup } from './utils/get-durable-object'
import { WebSocketGod } from './WebSocketService'
import { OnlineStatusService } from './OnlineStatusService'
import { newId } from '~/utils/new-id'
import { NotFoundError } from '~/errors/NotFoundError'

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
    this.fillRequiredFields()
    await this.contacts.initialize()
    await this.contacts.loadChatList()
  }

  private fillRequiredFields() {
    this.chatList = this.chatList.filter(chat => chat.id)
    for (const chat of this.chatList) {
      if (!chat.lastMessageTime) {
        chat.lastMessageTime = Date.now()
      }
      if (!chat.isMine) {
        chat.isMine = false
      }
    }
  }

  async createAi(userId: string) {
    const ai = this.chatList.find(chat => chat.id === 'AI')
    if (!ai) {
      const gpt = gptStorage(this.env, userId)
      const chat = (await gpt.create(userId)) as DialogAI
      const chatListItem: ChatListItem = {
        name: chat.name,
        missed: 0,
        id: chat.chatId,
        type: 'ai',
        verified: true,
        lastMessageTime: Date.now(),
        isMine: false,
      }

      this.chatList.unshift(chatListItem)
    } else if (ai.isMine === undefined) {
      ai.isMine = false
    } else if (!ai.lastMessageTime) {
      ai.lastMessageTime = Date.now()
    }
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
    if (!chatId) {
      return
    }

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
    this.chatList[index].photoUrl = eventData.photoUrl
    const after = this.env.ENV === 'dev' ? 1 : 1000
    await this.wsService.toSockets('chats', this.chatList, after, 'chats')
    await this.save()
    return {}
  }
  async chatRequest(chatId: string, userId: string) {
    let result: Dialog | Group
    const chatItem = this.chatList.find(chat => chat.id === chatId)
    if ((chatItem && chatItem.lastMessageTime) || chatId === 'AI' || isGroup(chatId)) {
      const chatStub = chatStorage(this.env, chatId, userId)
      const chatData = await chatStub.chat(userId)
      result = await this.contacts.patchChat(chatId, chatData)
    } else {
      const user = (
        await getUserById(this.env.DB, chatId, new NotFoundError(), 'ChatListService')
      ).profile()
      const patchedUser = await this.contacts.patchProfile(user)
      const lastSeen = await this.onlineService.lastSeenOf(chatId)
      result = {
        chatId,
        type: 'dialog',
        name: displayName(patchedUser),
        photoUrl: user.avatarUrl,
        missed: 0,
        lastMessageTime: Date.now(),
        isMine: false,

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
      await this.wsService.toSockets('chats', [chatListItem, ...this.chatList], 1500)
    }
    return result
  }
}
