import { DurableObjectState } from '@cloudflare/workers-types'
import { Profile, ProfileWithLastSeen, User } from '~/db/models/User'
import { getUserById } from '~/db/services/get-user'
import { Dialog, Group, GroupMeta } from '~/types/Chat'
import { Env } from '~/types/Env'
import { chatType, isGroup } from './utils/mdo'
import { ProfileService } from './ProfileService'
import { ChatListService } from './ChatListService'
import { displayName } from '~/services/display-name'
import { OnlineStatusService } from './OnlineStatusService'

export class ContactsManager {
  #contacts: Profile[] = []
  #usersCache = new Map<string, Profile>()
  #profileCache = new Map<string, Profile>()
  #blockCache = new Map<string, number>()

  constructor(
    private env: Env,
    private state: DurableObjectState,
    private profileService: ProfileService,
    private cl: ChatListService,
    private onlineService: OnlineStatusService,
  ) {
    // state.blockConcurrencyWhile(() => this.initialize())
    // INIT FROM CHATLISTSERVICEs
  }

  async initialize(): Promise<void> {
    await this.load()
  }
  async loadChatList() {
    for (const chat of this.cl.chatList) {
      if (chatType(chat.id) === 'dialog') {
        if (this.#contacts.some(c => c.id === chat.id)) continue
        const contact = await this.contact(chat.id)
        
      }
    }
  }
  async contact(userId: string): Promise<Profile | undefined> {
    let contact = this.#contacts.find(contact => contact.id === userId)
    if (contact) {
      return contact
    }
    let user = this.#usersCache.get(userId)
    if (!user) {
      user = await getUserById(this.env.DB, userId)
      if (!user) user = new User('42?!!', 'contact support').profile()
      this.#usersCache.set(userId, user)
    }
    let phone = user?.phoneNumber

    contact = this.#contacts.find(contact => contact.phoneNumber === phone)
    if (contact) {
      contact.id = userId
      await this.updateContacts([contact])
    }

    return contact as Profile
  }

  private merge(profile: Profile, contact: Profile): Profile {
    return {
      ...profile,
      ...contact,
      id: profile.id || contact.id,
    }
  }

  invalidateCache(userId: string) {
    this.#usersCache.delete(userId)
    this.#profileCache.delete(userId)
  }

  async patchProfile(profile: Profile) {
    const alreaydCached = this.#profileCache.get(profile.id)
    if (alreaydCached) {
      return alreaydCached
    }

    let contact = await this.contact(profile.id)
    if (contact) {
      return this.merge(profile, contact)
    }
    contact = await this.contact(profile.id)
    if (contact) {
      contact.phoneNumber = profile.phoneNumber
      await this.updateContacts([contact])
      return this.merge(profile, contact)
    }

    return profile
  }

  async patchChat(chatId: string, chat: Group | Dialog) {
    let result = chat
    if (chatId === 'AI') return chat 
    if (isGroup(chatId)) {
      ;(result.meta as GroupMeta).participants = await Promise.all(
        (result.meta as GroupMeta).participants.map((e: Profile) => this.patchProfile(e)),
      )
    } else {
      result.meta = await this.patchProfile(result.meta as Profile)
      chat.name = displayName(result.meta as Profile)
    }
    return result
  }

  async updateContacts(contacts: Profile[]): Promise<void> {
    if (!contacts) return
    const updatedContacts = contacts
      .map(contact => {
        const prevContact = this.#contacts.find(c => c.phoneNumber === contact.phoneNumber && c.id) || this.#contacts.find(c => c.phoneNumber === contact.phoneNumber )
        return { ...contact, prevContact }
      })
      .filter(
        ({ lastName, firstName, prevContact, avatarUrl, id }) =>
          !prevContact ||
          !id ||
          prevContact.lastName !== lastName ||
          prevContact.firstName !== firstName ||
          prevContact.avatarUrl !== avatarUrl,
      )
      .map(c => {
        const { prevContact, ...contact } = c
        return {
          ...(prevContact || contact),
          firstName: contact.firstName || prevContact?.firstName,
          lastName: contact.lastName || prevContact?.lastName,
          avatarUrl: contact.avatarUrl || prevContact?.avatarUrl,
          id: prevContact?.id || contact.id,
        }
      })

    for (const contact of updatedContacts) {
      if (contact.id) {
        this.invalidateCache(contact.id)
        await this.cl.updateChat({
          chatId: contact.id,
          name: displayName(contact),
          meta: contact,
          type: 'dialog',
        })
      }
    }

    const contactsByBlock = new Map<number, Profile[]>()
    for (const contact of updatedContacts) {
      const block = this.getBlock(contact.phoneNumber)
      if (!contactsByBlock.has(block)) {
        contactsByBlock.set(block, [])
      }
      contactsByBlock.get(block)!.push(contact)
    }

    await this.state.storage.transaction(async () => {
      for (const [block, contacts] of contactsByBlock) {
        const key = `contact-${block}`
        const existingContacts = this.#contacts.filter(c => this.getBlock(c.phoneNumber) === block)
        this.#contacts = [...this.#contacts.filter(c => !existingContacts.includes(c)), ...contacts]

        const contactsToUpdate = existingContacts
          .map(c => contacts.find(contact => contact.phoneNumber === c.phoneNumber))
          .filter(c => !!c)
          .concat(
            contacts.filter(
              contact => !existingContacts.some(c => c.phoneNumber === contact.phoneNumber),
            ),
          )

        if (contactsToUpdate.length) {
          await this.state.storage.put(key, contactsToUpdate)
        }
      }
    })
  }

  async bigUsers() {
    return Promise.all(
      this.#contacts
        .filter(c => !!c.id)
        .map<Promise<ProfileWithLastSeen>>(async c => {
          const chat = this.cl.chatList.find(chat => chat.id === c.id)
          let lastSeen
          if (chat) {
            lastSeen = chat.lastSeen
          } else {
            lastSeen = await this.onlineService.lastSeenOf(c.id)
          }
          return { ...c, lastSeen }
        }),
    )
  }
  private getBlock(phoneNumber: string): number {
    if (!phoneNumber) return 9
    if (this.#blockCache.has(phoneNumber)) {
      return this.#blockCache.get(phoneNumber)!
    }
    const hash = Array.from(phoneNumber).reduce((hash, char) => {
      return hash + char.charCodeAt(0)
    }, 0)
    const block = hash % 10
    this.#blockCache.set(phoneNumber, block)
    return block
  }
  private async load() {
    this.#contacts = [
      ...([...(await this.state.storage.list<Profile[]>({ prefix: 'contact-' })).values()] || []),
    ]
      .flat()
      .filter(c => {
        if (!c.id && this.#contacts.find(c2 => c2.phoneNumber === c.phoneNumber && c2.id)) {
          return false
        }
        if (
          c.id &&
          this.#contacts.findLast(c2 => c2.id === c.id && c2.phoneNumber === c.phoneNumber) !== c
        ) {
          return false
        }
        return true
      })
  }
}
