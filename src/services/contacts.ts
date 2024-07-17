import { Profile, ProfileWithLastSeen, User, UserDB } from '~/db/models/User'

import { OnlineStatus, UNKNOWN_LAST_SEEN } from '~/durable-objects/messaging/OnlineStatusService'
import { userStorage } from '~/durable-objects/messaging/utils/mdo'
import { ChatList } from '~/types/ChatList'
import { Env } from '~/types/Env'
import { PhoneBook, PhoneBookItem } from '~/types/PhoneBook'
import { digest } from '~/utils/digest'
import { ObjectSnakeToCamelCase, fromSnakeToCamel } from '~/utils/name-сases'
import { newId } from '~/utils/new-id'
import { normalizePhoneNumber } from '~/utils/normalize-phone-number'

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
        const contact = users.find(c => c.phoneNumber === pn.phoneNumber)
        if (!contact) return undefined
        return {
          id: contact.id,
          phoneNumber: pn.phoneNumber,
          avatarUrl: pn.avatarUrl || contact.avatarUrl,
          firstName: pn.firstName,
          lastName: pn.lastName,
          username: contact.username,
        }
      })

      .filter(e => !!e)
      .map(async e => ({ ...e, fingerprint: await contactFingerprint(e) })),
  )

  const userMessagingDO = userStorage(env, user.id)
  await userMessagingDO.fetch(
    new Request(`${env.ORIGIN}/${user.id}/client/request/${method}Contacts`, {
      method: 'POST',
      body: JSON.stringify(phoneBookWithIds),
    }),
  )

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

export async function getContacts(env: Env, ownerId: string) {
  const query = 'SELECT * FROM contacts WHERE owner_id = ?'
  const contacts = await env.DB.prepare(query).bind(ownerId).all()
  return contacts.results.map(fromSnakeToCamel)
}

export async function getMergedContacts(env: Env): Promise<ProfileWithLastSeen[]> {
  const userMessagingDO = userStorage(env, env.user.id)

  const response = await userMessagingDO.fetch(
    new Request(`${env.ORIGIN}/${env.user.id}/client/request/contacts`, {
      method: 'POST',
      body: '{}',
    }),
  )
  return response.json<ProfileWithLastSeen[]>()

  // const query = `
  //   SELECT u.id,
  //          CASE WHEN COALESCE(pn.first_name, '') = '' THEN u.first_name ELSE pn.first_name END AS first_name,
  //          CASE WHEN COALESCE(pn.last_name, '') = '' THEN u.last_name ELSE pn.last_name END AS last_name,
  //          CASE WHEN COALESCE(pn.avatar_url, '') = '' THEN u.avatar_url ELSE pn.avatar_url END AS avatar_url,
  //          u.phone_number,
  //          u.username,
  //          u.created_at,
  //          u.verified
  //   FROM phone_numbers pn
  //   JOIN users u ON pn.phone_number2 = u.phone_number
  //   WHERE pn.phone_number1 = ?
  // `
  // const contacts = await env.DB.prepare(query).bind(env.user.phoneNumber).all<Required<UserDB>>()

  // const userMessagingDO1 = userStorage(env, env.user.id)

  // const chatListResponse = await userMessagingDO.fetch(
  //   new Request(`${env.ORIGIN}/${env.user.id}/client/request/chats`, {
  //     method: 'POST',
  //     body: '{}',
  //   }),
  // )

  // const chatList = await chatListResponse.json<ChatList>()
  // const chatListIds = chatList.filter(chat => chat.type === 'dialog').map(chat => chat.id)

  // const chatListUsers = { results: [] as Required<UserDB>[] }
  // if (chatListIds.length > 0) {
  //   for (let i = 0; i < chatListIds.length; i += 10) {
  //     const chunk = chatListIds.slice(i, i + 10)
  //     const chatListUsersQuery = `
  //       SELECT u.*
  //       FROM users u
  //       WHERE id IN (${chunk.map(() => '?').join(',')})
  //     `
  //     const chunkResults = await env.DB.prepare(chatListUsersQuery)
  //       .bind(...chunk)
  //       .all<Required<UserDB>>()
  //     chatListUsers.results.push(...chunkResults.results)
  //   }
  // }

  // const combinedResults = [...contacts.results, ...chatListUsers.results]
  // type UserDBWithStatus = Required<UserDB> & {
  //   status: 'online' | 'offline' | 'unknown'
  //   lastSeen?: number
  // }
  // const uniqueResults: UserDBWithStatus[] = combinedResults.reduce<UserDBWithStatus[]>(
  //   (acc, current) => {
  //     const x = acc.find(item => item.id === current.id)
  //     if (!x) {
  //       acc.push({ ...current, status: 'unknown' })
  //     }
  //     return acc
  //   },
  //   [],
  // )

  // const promises = uniqueResults
  //   .filter(u => u.first_name || u.last_name || u.username)
  //   .map(async contact => {
  //     const contactFromChatList = chatList.find(chat => chat.id === contact.id)
  //     if (contactFromChatList) {
  //       contact.lastSeen = contactFromChatList.lastSeen
  //       contact.status = contactFromChatList.lastSeen ? 'offline' : 'online'
  //     } else {
  //       const mdo = userStorage(env, contact.id)
  //       const lastSeenResponse = await mdo.fetch(
  //         new Request(`${env.ORIGIN}/${contact.id}/client/request/lastSeen`, {
  //           method: 'POST',
  //         }),
  //       )
  //       const lastSeen = await lastSeenResponse.json<OnlineStatus>()
  //       if (lastSeen.status === 'offline') {
  //         contact.lastSeen = lastSeen.lastSeen
  //         contact.status = lastSeen.status
  //       }
  //     }
  //     return {
  //       id: contact.id,
  //       phoneNumber: contact.phone_number,
  //       firstName: contact.first_name || undefined,
  //       lastName: contact.last_name || undefined,
  //       username: contact.username || undefined,
  //       avatarUrl: contact.avatar_url || undefined,
  //       verified: !!(contact.verified || false),
  //       lastSeen: contact.lastSeen,
  //       status: contact.status,
  //     } as ProfileWithLastSeen
  //   })

  // return Promise.all(promises)
}

export async function getContactById(env: Env, id: string, ownerId: string) {
  const query = 'SELECT * FROM contacts WHERE id = ? AND owner_id = ?'
  const contact = await env.DB.prepare(query).bind(id, ownerId).first()
  return contact ? fromSnakeToCamel(contact) : null
}

export async function updateContact(env: Env, id: string, updates: any, ownerId: string) {
  const { clientId, userId, phoneNumber, username, firstName, lastName, avatarUrl } = updates
  const updateQuery = `
    UPDATE contacts
    SET client_id = ?, user_id = ?, phone_number = ?, username = ?, first_name = ?, last_name = ?, avatar_url = ?
    WHERE id = ? AND owner_id = ?
  `
  const result = await env.DB.prepare(updateQuery)
    .bind(clientId, userId, phoneNumber, username, firstName, lastName, avatarUrl, id, ownerId)
    .run()
  return result.success ? { id, ...updates } : null
}

export async function deleteContact(env: Env, id: string, ownerId: string) {
  const deleteQuery = 'DELETE FROM contacts WHERE id = ? AND owner_id = ?'
  const result = await env.DB.prepare(deleteQuery).bind(id, ownerId).run()
  return result.success
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
