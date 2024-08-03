import { Profile, ProfileWithLastSeen, User, UserDB } from '~/db/models/User'

import { userStorageById } from '~/durable-objects/messaging/utils/get-durable-object'
import { Env } from '~/types/Env'
import { PhoneBook, PhoneBookItem } from '~/types/PhoneBook'
import { digest } from '~/utils/digest'
import { ObjectSnakeToCamelCase, fromSnakeToCamel } from '~/utils/name-сases'
import { newId } from '~/utils/new-id'

export interface ContactDB {
  id: string
  client_id: string
  user_id: string
  first_name: string
  last_name: string
  phone_number: string
  avatar_url: string
  readonly username: string
}

export type Contact = ObjectSnakeToCamelCase<ContactDB>

type pRow = {
  phone_number1: string
  phone_number2: string
  row_fingerprint: string
}

export async function putContacts(user: User, phoneNumbers: PhoneBook, users: Profile[], env: Env, method: "update" | "replace" = "replace") {
  const phoneBookWithIds: (Profile & PhoneBookItem)[] = await Promise.all(
    phoneNumbers
      .map((pn: PhoneBookItem) => {
        const user = users.find(c => c.phoneNumber === pn.phoneNumber)
        if (!user) return undefined
        return {
          id: user.id,
          phoneNumber: pn.phoneNumber,
          avatarUrl: user.avatarUrl,
          firstName: pn.firstName,
          lastName: pn.lastName,
          username: user.username,
          verified: user.verified
        }
      })

      .filter(e => !!e)
      .map(async e => ({ ...e, fingerprint: await contactFingerprint(e) })),
  )


  const userMessagingDO = userStorageById(env, user.id)
  await userMessagingDO.updateContactsRequest(phoneBookWithIds, method === 'replace')


  const DB = env.DB
  const query =
    'SELECT row_fingerprint, phone_number1, phone_number2 FROM phone_numbers pn WHERE pn.phone_number1 = ?'
  let existing: pRow[]
  try {
    existing = (await DB.prepare(query).bind(user.phoneNumber).all<pRow>()).results
  } catch (error) {
    // Handle error
    console.error(error)
    existing = []
  }

  const changedNumbers = phoneBookWithIds.filter(pn =>
    existing.some(e => e.row_fingerprint !== pn.fingerprint && e.phone_number2 === pn.phoneNumber),
  )

  const newNumbers = phoneBookWithIds.filter(
    pn => !existing.some(e => e.phone_number2 === pn.phoneNumber),
  )

  const chunkSize = 10
  for (let i = 0; i < changedNumbers.length; i += chunkSize) {
    const chunk = changedNumbers.slice(i, i + chunkSize)
    const updateQuery = `
      UPDATE phone_numbers 
      SET first_name = ?, last_name = ?, row_fingerprint = ?, avatar_url = ?
      WHERE phone_number1 = ? AND phone_number2 = ?
    `
    for (const pn of chunk) {
      try {
        await DB.prepare(updateQuery)
          .bind(
            pn.firstName ?? '',
            pn.lastName ?? '',
            pn.fingerprint ?? '',
            pn.avatarUrl ?? '',
            user.phoneNumber,
            pn.phoneNumber,
          )
          .run()
      } catch (error) {
        // Handle error
        console.error(error)
        throw error
      }
    }
  }
  for (let i = 0; i < newNumbers.length; i += chunkSize) {
    const chunk = newNumbers.slice(i, i + chunkSize)
    const values = chunk
      .map(
        pn =>
          `('${user.phoneNumber}', '${pn.phoneNumber}', '${pn.firstName ?? ''}', '${pn.lastName ?? ''}', '${pn.fingerprint}', '${pn.avatarUrl ?? ''}')`,
      )
      .join(', ')

    const chunkInsertQuery = `
      INSERT INTO phone_numbers (phone_number1, phone_number2, first_name, last_name, row_fingerprint, avatar_url)
      VALUES ${values}
    `
    try {
      await DB.prepare(chunkInsertQuery).run()
    } catch (error) {
      // Handle error
      console.error(error)
      throw error
    }
  }
}

async function contactFingerprint(pn: PhoneBookItem) {
  return digest(pn.phoneNumber + (pn.firstName ?? '') + (pn.lastName ?? '') + (pn.avatarUrl ?? ''))
}

export async function createContact(env: Env, contact: any) {
  let { clientId, phoneNumber, username, firstName, lastName, avatarUrl } = contact
  const ownerId = env.user.id

  // Validate that user_id exists in the Users table
  const userExistsQuery = 'SELECT id FROM users WHERE phone_number = ?'
  const userExistsResult = await env.DB.prepare(userExistsQuery)
    .bind(phoneNumber)
    .first<{ id: string }>()
  const userId = userExistsResult?.id
  // Validate that there is no existing record with the same user_id for the given owner_id
  if (!userId) {
    throw new Error('user with this phone number is not registered', {
      cause: 'USER_IS_NOT_REGISTERED',
    })
  }

  await putContacts(env.user, [contact], [new User(userId, phoneNumber).profile()], env, "update")
  const existingContactQuery = 'SELECT * FROM contacts WHERE phone_number = ? AND owner_id = ?'

  const existingContact = await env.DB.prepare(existingContactQuery)
    .bind(phoneNumber, ownerId)
    .first<Contact>()
  let id = existingContact?.id

  if (id) {
    clientId = existingContact?.clientId ?? clientId
    firstName = existingContact?.firstName ?? firstName
    lastName = existingContact?.lastName ?? lastName
    avatarUrl = existingContact?.avatarUrl ?? avatarUrl

    const dropQuery = `
    DELETE FROM contacts WHERE id = ?
  `
    await env.DB.prepare(dropQuery).bind(id).run()
  } else {
    id = newId()
  }
  const insertQuery = `
    INSERT INTO contacts (id, client_id, user_id, phone_number, username, first_name, last_name, avatar_url, owner_id)
    VALUES (?, ?, ?,?,  ?, ?, ?, ?, ?)
  `
  await env.DB.prepare(insertQuery)
    .bind(
      id,
      clientId ?? '',
      userId ?? undefined,
      phoneNumber,
      username ?? '',
      firstName ?? '',
      lastName ?? '',
      avatarUrl ?? '',
      ownerId,
    )
    .run()
  return { id, clientId, userId, firstName, lastName, phoneNumber, avatarUrl, username }
}

export async function getMergedContacts(env: Env): Promise<ProfileWithLastSeen[]> {
  return userStorageById(env, env.user.id).contactsRequest();
}

export async function getContactById(env: Env, id: string, ownerId: string) {
  const query = 'SELECT * FROM contacts WHERE id = ? AND owner_id = ?'
  const contact = await env.DB.prepare(query).bind(id, ownerId).first()
  return contact ? fromSnakeToCamel(contact) : null
}

export async function findUserByUsername(env: Env, username: string) {
  const query = 'SELECT * FROM users WHERE username = ? AND deleted_at IS NULL'
  const userDb = await env.DB.prepare(query).bind(username).first<UserDB>()

  return userDb ? User.fromDb(userDb).profile() : null
}

export async function findUserByPhoneNumber(env: Env, phoneNumber: string) {
  const query = 'SELECT * FROM users WHERE phone_number = ? AND deleted_at IS NULL'
  const userDb = await env.DB.prepare(query).bind(phoneNumber).first<UserDB>()
  return userDb ? User.fromDb(userDb).profile() : null
}
