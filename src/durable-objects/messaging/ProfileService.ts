import { Profile } from '~/db/models/User'
import { ChatList } from '~/types/ChatList'
import { Env } from '~/types/Env'
import { DialogsDO } from './DialogsDO'
import { GroupChatsDO } from './GroupChatsDO'
import { chatStorage } from './utils/mdo'

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
