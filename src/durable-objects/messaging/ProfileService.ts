import { Profile } from '~/db/models/User'
import { ChatList } from '~/types/ChatList'
import { Env } from '~/types/Env'
import { OnlineEvent } from '~/types/ws/server-events'
import { WebSocketGod } from './WebSocketService'
import { chatStorage, userStorage } from './utils/mdo'
import { set } from 'zod'
import { GroupChatsDO } from './GroupChatsDO'
import { DialogsDO } from './DialogsDO'

export class ProfileService {
  constructor(
    private readonly state: DurableObjectState,
    private env: Env,
  ) {}

  async broadcastProfile(profile: Profile) {
    const chatList = await this.state.storage.get<ChatList>('chatList')
    const promises: Promise<void>[] = []
    if (!chatList) {
      return
    }

    for (const chat of chatList) {
      if (chat.id === profile.id) {
        continue
      }
      if (chat.type !== 'ai') {
        const storage = chatStorage(this.env, chat.id, profile.id) as DurableObjectStub<
          GroupChatsDO | DialogsDO
        >
        promises.push(storage.updateProfile(profile))
      }
      this.state.waitUntil(Promise.all(promises))
    }
  }
}
