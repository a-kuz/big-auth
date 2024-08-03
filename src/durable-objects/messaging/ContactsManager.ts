import { DurableObjectState } from '@cloudflare/workers-types'
import { Profile, ProfileWithLastSeen, User } from '~/db/models/User'
import { getUserById } from '~/db/services/get-user'
import { Dialog, Group, GroupMeta } from '~/types/Chat'
import { Env } from '~/types/Env'
import { chatType, isGroup } from './utils/get-durable-object'
import { ProfileService } from './ProfileService'
import { ChatListService } from './ChatListService'
import { displayName } from '~/services/display-name'
import { OnlineStatusService } from './OnlineStatusService'
import { NotFoundError } from '~/errors/NotFoundError'

export class ContactsManager {
  #contacts: Profile[] = []
  #usersCache = new Map<string, Profile>()
  #profileCache = new Map<string, Profile>()
  #blockCache = new Map<string, number>()

  constructor(
    private state: DurableObjectState,
    private env: Env,
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
      if (!chat.id) {
        console.log('!!!!!')
        console.log(this.cl.chatList)
      }
      if (chatType(chat.id) === 'dialog') {
        if (this.#contacts.some(c => c.id === chat.id)) continue
        const contact = await this.contact(chat.id)
        if (!chat.photoUrl && contact?.avatarUrl) {
          chat.photoUrl = contact.avatarUrl
        }
      }
    }
  }

  async contact(userId: string): Promise<Profile> {
    let contact = this.#contacts.find(contact => contact.id === userId)
    if (contact) {
      return contact
    }
    let user = this.#usersCache.get(userId)
    if (!user) {
      user = (
        await getUserById(
          this.env.DB,
          userId,
          new NotFoundError(`user ${userId} is not exists, contacts manager 1`),
          'ContactsManager-57',
        )
      )?.profile()
      if (!user) user = new User('42?!!', 'contact support').profile()
      this.#usersCache.set(userId, user)
    }
    let phone = user?.phoneNumber

    contact = this.#contacts.find(contact => contact.phoneNumber === phone)
    if (contact) {
      contact.id = userId
      await this.updateContacts([contact])
    }

    return (contact || user) as Profile
  }

  private merge(profile: Profile, contact: Profile): Profile {
    return {
      id: profile.id || contact.id,
      phoneNumber: profile.phoneNumber || contact.phoneNumber,
      firstName: contact ? contact.firstName : profile.firstName,
      lastName: contact ? contact.lastName : profile.lastName,
      username: contact.username || profile.username,
      avatarUrl: contact.avatarUrl || profile.avatarUrl,
      verified: profile.verified,
    }
  }

  invalidateCache(userId: string) {
    this.#usersCache.delete(userId)
    this.#profileCache.delete(userId)
  }

  async patchProfile(profile: Profile) {
    if (profile.id === 'AI') return profile
    const alreaydCached = this.#profileCache.get(profile.id)
    if (alreaydCached) {
      return alreaydCached
    }

    let contact = await this.contact(profile.id)
    if (contact) {
      return this.merge(profile, contact)
    }

    return profile
  }

  async patchChat(chatId: string, chat: Group | Dialog) {
    if (chatId === 'AI') return chat
    let result = chat

    if (isGroup(chatId)) {
      ;(result.meta as GroupMeta).participants = await Promise.all(
        (result.meta as GroupMeta).participants.map((e: Profile) => this.patchProfile(e)),
      )
    } else {
      result.meta = await this.patchProfile(result.meta as Profile)
      chat.name = displayName(result.meta as Profile)
      chat.photoUrl = chat.photoUrl || result.meta.avatarUrl
    }
    return result
  }

  async updateContacts(contacts: Profile[]): Promise<void> {
    if (!contacts) return
    const updatedContacts = contacts
      .map(contact => {
        const prevContact =
          this.#contacts.find(c => c.phoneNumber === contact.phoneNumber && c.id) ||
          this.#contacts.find(c => c.phoneNumber === contact.phoneNumber)
        return { ...contact, prevContact }
      })
      .filter(
        ({ lastName, firstName, prevContact, avatarUrl, id, verified }) =>
          !prevContact ||
          !id ||
          prevContact.lastName !== lastName ||
          prevContact.firstName !== firstName ||
          prevContact.avatarUrl !== avatarUrl ||
          prevContact.verified !== verified,
      )
      .map(c => {
        const { prevContact, ...contact } = c
        return {
          ...(contact || prevContact),
          firstName: contact.firstName ?? '',
          lastName: contact.lastName ?? '',
          avatarUrl: contact.avatarUrl ?? '',
          id: prevContact?.id || contact.id,
          verified: contact.verified,
        }
      })

    for (const contact of updatedContacts) {
      if (contact.id) {
        await this.cl.updateChat(
          {
            chatId: contact.id,
            name: displayName(contact),
            meta: contact,
            type: 'dialog',
          },
          true,
        )
        this.invalidateCache(contact.id)
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

    for (let [block, contacts] of contactsByBlock.entries()) {
      const existingContacts = this.#contacts
        .filter(c => this.getBlock(c.phoneNumber) === block)
        .filter(c1 => !contacts.find(c2 => c1.phoneNumber === c2.phoneNumber))
      for (const existingContact of existingContacts) {
        contactsByBlock.get(block)!.push(existingContact)
      }
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

  async bigUsers(withChatList = false) {
    if (!withChatList)
      return this.#contacts.map(c => ({
        ...c,
        firstName: c.firstName ? c.firstName : c.lastName,
        lastName: c.firstName ? c.lastName : '',
      }))
    return Promise.all(
      [
        ...this.#contacts,
        ...(await Promise.all(
          this.cl.chatList
            .filter(chat => chat.type === 'dialog')
            .filter(chat => !this.#contacts.some(contact => contact.id === chat.id))
            .map(async chat => ({ ...(await this.contact(chat.id)) })),
        )),
      ]
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
    ].flat()
    this.#contacts = this.#contacts.filter(c => {
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

  async replaceContacts(contacts: Profile[]): Promise<void> {
    const contactsToRemove = this.#contacts.filter(
      existingContact =>
        !contacts.some(contact => contact.phoneNumber === existingContact.phoneNumber),
    )
    console.log('remove:')
    console.log(JSON.stringify(contactsToRemove))
    for (const contact of contactsToRemove) {
      const block = this.getBlock(contact.phoneNumber)
      const key = `contact-${block}`
      const existingContacts = this.#contacts.filter(c => this.getBlock(c.phoneNumber) === block)
      this.#contacts = this.#contacts.filter(c => c.phoneNumber !== contact.phoneNumber)
      this.invalidateCache(contact.id)
      let user = this.#usersCache.get(contact.id)
      if (!user) {
        user = await getUserById(
          this.env.DB,
          contact.id,
          new NotFoundError(`user ${contact.id} is not exists, contacts manager 2`),
          'ContactsManager-290',
        )

        this.#usersCache.set(contact.id, user)
      }
      await this.cl.updateChat(
        {
          chatId: contact.id,
          name: displayName(user),
          meta: user,
          type: 'dialog',
        },
        true,
      )

      await this.state.storage.put(
        key,
        existingContacts.filter(c => c.phoneNumber !== contact.phoneNumber),
      )
    }

    await this.updateContacts(contacts)
  }
}
