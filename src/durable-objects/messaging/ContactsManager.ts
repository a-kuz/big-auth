import { DurableObjectState } from '@cloudflare/workers-types'
import { Contact } from '~/services/contacts'
import { Profile } from '~/db/models/User'
import { displayName } from '~/services/display-name'
import { getUserById } from '~/db/services/get-user'
import { env } from 'process'
import { Env } from '~/types/Env'

export class ContactsManager {
  #contacts: Profile[] = []
  #usersCache = new Map<string, Profile>()

  constructor(
    private env: Env,
    private state: DurableObjectState,
  ) {}

  async initialize(): Promise<void> {
    this.#contacts = await this.getContacts()
  }

  async contact(userId: string): Promise<Profile | undefined> {
    let contact = this.#contacts.find(contact => contact.id === userId)
    if (contact) {
      return contact
    }
    let user = this.#usersCache.get(userId)
    let phone = user?.phoneNumber
    if (!user) {
      user = (await getUserById(this.env.DB, userId)!).profile()
      phone = user.phoneNumber
      this.#usersCache.set(userId, user)
    }

    contact = this.#contacts.find(contact => contact.phoneNumber === phone)
    if (contact) {
      contact.id = userId
      await this.updateContacts([contact])
    }

    
    return contact as Profile
  }

  merge(profile: Profile, contact: Profile): Profile {
    return {
      ...profile,
      ...contact,
      id: profile.id || contact.id,
    }
  }
  async patch(profile: Profile) {
    let contact = this.#contacts.find(contact => contact.phoneNumber === profile.phoneNumber)
    if (contact) {
      return this.merge(profile, contact)
    
    }
    contact = await this.contact(profile.id)
    if (contact) {
      contact.phoneNumber = profile.phoneNumber
      await this.updateContacts([contact])
      return this.merge(profile, contact)
    }
  }

  async getContacts(): Promise<Profile[]> {
    const contacts: Profile[] = []
    const stored = await this.state.storage.list<Profile[]>({ prefix: 'contact-' })

    for (const [, chunk] of stored) {
      contacts.push(...chunk)
    }

    return contacts
  }

  async updateContacts(updatedContacts: Profile[]): Promise<void> {
    const updatedContactsMap = new Map(
      updatedContacts.map(contact => [contact.phoneNumber, contact]),
    )

    const newContacts = this.#contacts.map(contact => {
      const updatedContact = updatedContactsMap.get(contact.phoneNumber)
      return updatedContact ? { ...contact, ...updatedContact } : contact
    })

    await this.state.storage.transaction(async () => {
      await this.state.storage.delete([
        ...(await this.state.storage.list({ prefix: 'contact-' })).keys(),
      ])

      const CHUNK_SIZE = 100
      for (let i = 0; i < newContacts.length; i += CHUNK_SIZE) {
        const chunk = newContacts.slice(i, i + CHUNK_SIZE)
        const key = `contact-${Math.floor(i / CHUNK_SIZE)}`
        await this.state.storage.put(key, chunk)
      }

      this.#contacts = newContacts
    })
  }
}
