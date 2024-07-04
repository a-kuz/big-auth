import { ChatList } from '~/types/ChatList'
import { Env } from '~/types/Env'

export class ChatListService {
  public chatList: ChatList = [] // memory access optimization
  #chatListTimer: NodeJS.Timeout | undefined
  #storage!: DurableObjectStorage
  constructor(state: DurableObjectState, env: Env) {
    this.#storage = state.storage

    state.blockConcurrencyWhile(async () => this.initialize())
  }

  private async initialize() {
    this.chatList = (await this.#storage.get<ChatList>('chatList')) || []
  }

  save() {
    if (this.#chatListTimer) {
      clearTimeout(this.#chatListTimer)
    }
    this.#chatListTimer = setTimeout(async () => {
      await this.#storage.put('chatList', this.chatList, {
        allowUnconfirmed: true,
        allowConcurrency: true,
      })
      this.#chatListTimer = undefined
    }, 10)
  }
}
