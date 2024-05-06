import { ChatMessage } from '~/types/ChatMessage'
import { Env } from '~/types/Env'

export class ChatManager {
  constructor(
    private state: DurableObjectState,
    private env: Env,
    private id: string,
  ) {}

  async message(messageId: number) {
    let m = this.messages[messageId]
    if (m) return m

    m = await this.state.blockConcurrencyWhile(() =>
      this.state.storage.get<ChatMessage>(`${this.id}=>${messageId.toString()}`),
    )
  }

  async messageByTimestamp(timestamp: number) {}

  async messageByAuthor(authorId: string) {}

  async messageByAuthorAndTimestamp(authorId: string, timestamp: number) {}

  setUserId(id: string) {
    this.userId = id
  }
  userId = ''
  lastMessageId: number = 0
  messages: { [key: number]: ChatMessage | undefined } = {} // cache
}
