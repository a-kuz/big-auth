import { ChatList } from '~/types/ChatList'
import { Env } from '~/types/Env'
import { WebSocketGod } from './WebSocketService'
import { OnlineEvent } from '~/types/ws/server-events'

export class MessagesService {
  constructor(
    private storage: DurableObjectStorage,
  ) {}

 loadMessages() {

 }







  setUserId(id: string) {
    this.#userId = id
  }
  #userId = ''
  #isOnline = false
}
