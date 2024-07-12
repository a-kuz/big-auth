import { DurableObjectState } from '@cloudflare/workers-types'
import { Profile } from '~/db/models/User'
import { getUserById } from '~/db/services/get-user'
import { Env } from '~/types/Env'

export class ContactsManager {
  #contacts: Profile[] = []
  #usersCache = new Map<string, Profile>()
  #profileCache = new Map<string, Profile>()

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

  invalidateCache(userId: string) {
    this.#usersCache.delete(userId)
    this.#profileCache.delete(userId)
  }
  async patch(profile: Profile) {
    const alreaydCached = this.#profileCache.get(profile.id)
    if (alreaydCached) {
      return alreaydCached
    }

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

    return profile
  }

  async getContacts(): Promise<Profile[]> {
    const contacts: Profile[] = []
    for (let i = 0; i < 10; i++) {
      const chunk = await this.state.storage.get<Profile[]>(`contact-${i}`)
      if (chunk) {
        contacts.push(...chunk)
      }
    }
    return contacts
  }

  async updateContacts(updatedContacts: Profile[]): Promise<void> {
    const updatedContactsMap = new Map(
      updatedContacts.map(contact => [contact.phoneNumber, contact]),
    )

    const newContacts = this.#contacts.map(contact => {
      const updatedContact = updatedContactsMap.get(contact.phoneNumber)
      for (const contact of updatedContacts) {
        this.invalidateCache(contact.id);
      }
      return updatedContact ? { ...contact, ...updatedContact } : contact
    });

    const contactsByBlock = new Map<number, Profile[]>()
    for (const contact of newContacts) {
      const block = this.getBlock(contact.phoneNumber)
      if (!contactsByBlock.has(block)) {
        contactsByBlock.set(block, [])
      }
      contactsByBlock.get(block)!.push(contact)
    }

    await this.state.storage.transaction(async () => {
      for (const [block, contacts] of contactsByBlock) {
        const key = `contact-${block}`
        await this.state.storage.put(key, contacts)
      }
      this.#contacts = newContacts
    })
  }
  private getBlock(phoneNumber: string): number {
    const hash = Array.from(phoneNumber).reduce((hash, char) => {
      return hash + char.charCodeAt(0)
    }, 0)
    return hash % 10
  }
}
