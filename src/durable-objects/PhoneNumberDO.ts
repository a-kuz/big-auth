import { DurableObjectState } from '@cloudflare/workers-types'
import { Task } from 'do-taskmanager'
import { getUsersByPhoneNumbers } from '~/db/services/get-user'
import { Env } from '~/types/Env'
import { DebugableDurableObject } from './DebugableDurableObject'

interface Contact {
  phoneNumber: string
  userId?: string
  incoming?: boolean
  own?: boolean
}
interface ScheduledTaskContextPayload {
  phoneNumber: string
  contact: Contact
}

interface ScheduledTaskContext {
  type: 'registerContact' | 'registerUserId'
  payload: ScheduledTaskContextPayload
}

export class PhoneNumberDO extends DebugableDurableObject {
  #phoneNumber: string = ''
  #userId: string = ''
  #contacts: Map<string, Contact> = new Map()

  constructor(
    readonly ctx: DurableObjectState,
    env: Env,
  ) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      this.#userId = (await ctx.storage.get<string>('userId')) || ''
      this.#phoneNumber = (await ctx.storage.get<string>('phoneNumber')) || ''
      const storedContacts = await ctx.storage.list<Contact>({ prefix: 'contact::' })
      for (const [key, contact] of storedContacts) {
        this.#contacts.set(key, contact)
      }
    })
  }

  async processTask(task: Task): Promise<void> {
    const context = task.context as ScheduledTaskContext
    switch (context.type) {
      case 'registerContact':
        await this.processContact(context.payload)
      case 'registerUserId':
        await this.processBroadcastingUserId(context.payload)
    }
  }

  async processContact({ phoneNumber, contact }: ScheduledTaskContextPayload) {
    const key = `contact::${phoneNumber}`
    const doId = this.env.PN_DO.idFromName(phoneNumber)
    const doStub = this.env.PN_DO.get(doId)
    const registerResult = await doStub.registerContact(
      phoneNumber,
      this.#phoneNumber,
      this.#userId,
    )
    contact.userId = registerResult?.userId
    contact.incoming = contact.incoming || registerResult?.match
    this.#contacts.set(key, contact)
    await this.ctx.storage.put(key, contact)
    console.log(`${JSON.stringify(contact)} processed`)
  }

  async processBroadcastingUserId({ phoneNumber }: ScheduledTaskContextPayload) {
    const key = `contact::${phoneNumber}`
    const doId = this.env.PN_DO.idFromName(phoneNumber)
    const doStub = this.env.PN_DO.get(doId)
    const registerResult = await doStub.registerUserId(
      this.#phoneNumber,
      this.#userId,
    )
    
    console.log(`${JSON.stringify(registerResult)} processed`)
  }

  async getMatchedContacts() {
    const matchedContacts = Array.from(this.#contacts.values()).filter(
      contact => contact.own && contact.incoming,
    )
    return matchedContacts
  }

  async setPhoneNumber(phoneNumber: string) {
    if (!this.#phoneNumber) {
      this.#phoneNumber = phoneNumber
      await this.ctx.storage.put('phoneNumber', phoneNumber)
      const users = await getUsersByPhoneNumbers(this.env.DB, [{ phoneNumber }])

      this.#userId = users.length ? users[0].id : ''
    }
  }

  async setUserId(userId: string) {
    let t = 1000;
    await this.ctx.storage.put('userId', userId)
    this.#userId = userId
    for (const contact of this.#contacts.values()) {
      if (contact.incoming) {
        this.scheduleTaskIn(t,   {
          type: 'registerUserId',
          payload: { phoneNumber: contact.phoneNumber },
        },)
      }
      t+=25
    }
  }

  async registerUserId(phoneNumber: string, userId: string) {
    const key = `contact::${phoneNumber}`
    const contact = this.#contacts.get(key) || { phoneNumber, incoming: true }
    contact.userId = userId
    this.#contacts.set(key, contact)
    await this.ctx.storage.put(key, contact)
    return {phoneNumber: this.#phoneNumber, userId: this.#userId} as Contact
  }

  async registerContact(myPhoneNumber: string, phoneNumber: string, userId: string) {
    await this.setPhoneNumber(myPhoneNumber)
    const key = `contact::${phoneNumber}`
    let contact = this.#contacts.get(key)
    if (contact) {
      if (!contact.incoming) {
        // MATCH!!!
        const incomingContact = { ...contact, incoming: true, userId }
        this.#contacts.set(key, incomingContact)
        await this.ctx.storage.put(key, incomingContact)
      }
    } else {
      contact = { phoneNumber, incoming: true, userId }
      this.#contacts.set(key, contact)
      await this.ctx.storage.put(key, contact)
    }
    return { userId: this.#userId, match: !!contact.own }
  }

  async registerOwnContacts(phoneNumbers: string[]) {
    let t = 1
    for (const phoneNumber of phoneNumbers) {
      const key = `contact::${phoneNumber}`
      let contact = this.#contacts.get(key)
      if (contact) {
        if (!contact.own) {
          contact.own = true

          // MATCH!!!
        }
      } else if (!contact) {
        contact = {
          phoneNumber,
          own: true,
        }
        this.scheduleTaskIn(
          t,
          {
            type: 'registerContact',
            payload: { phoneNumber, contact },
          },
          { retryInterval: 200 + (t % 100) * 10 },
        )
        t += 5
      }
    }
  }
}
