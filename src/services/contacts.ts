import { Profile, ProfileWithLastSeen, User, UserDB } from '~/db/models/User'
import { OnlineStatus, UNKNOWN_LAST_SEEN } from '~/durable-objects/messaging/OnlineStatusService'
import { userStorage } from '~/durable-objects/messaging/utils/mdo'
import { ChatList } from '~/types/ChatList'
import { Env } from '~/types/Env'
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
}

export async function putContacts(
  user: User,
  phoneNumbers: string[],
  contacts: Profile[],
  env: Env,
) {
  const DB = env.DB
  const query = 'SELECT * FROM phone_numbers WHERE phone_number1 = ?'
  let existing: pRow[]
  try {
    existing = (await DB.prepare(query).bind(user.phoneNumber).all<pRow>()).results
  } catch (error) {
    // Handle error
    console.error(error)
    existing = []
  }

  const newNumbers = phoneNumbers.filter(pn => !existing.find(e => e.phone_number2 === pn))

  const insertQuery = 'INSERT INTO phone_numbers (phone_number1, phone_number2) VALUES (?, ?)'
  const chunkSize = 20;
  for (let i = 0; i < newNumbers.length; i += chunkSize) {
    const chunk = newNumbers.slice(i, i + chunkSize);
    const values = chunk.map(pn => `('${user.phoneNumber}', '${pn}')`).join(', ');
    const chunkInsertQuery = `INSERT INTO phone_numbers (phone_number1, phone_number2) VALUES ${values}`;
    try {
      await DB.prepare(chunkInsertQuery).run();
    } catch (error) {
      // Handle error
      console.error(error);
      throw error;
    }


  }
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
  const query = `
    SELECT u.id,
           CASE WHEN COALESCE(c.first_name, '') = '' THEN u.first_name ELSE c.first_name END AS first_name,
           CASE WHEN COALESCE(c.last_name, '') = '' THEN u.last_name ELSE c.last_name END AS last_name,
           CASE WHEN COALESCE(c.avatar_url, '') = '' THEN u.avatar_url ELSE c.avatar_url END AS avatar_url,
           u.phone_number,
           u.username,
           u.created_at,
           u.verified
    FROM contacts c
    JOIN users u ON u.id = c.user_id
    WHERE c.owner_id = ?
    UNION
    SELECT u.id,
           u.first_name,
           u.last_name,
           u.avatar_url,
           u.phone_number,
           u.username,
           u.created_at,
					 u.verified
    FROM phone_numbers pn
    JOIN users u ON pn.phone_number2 = u.phone_number
    WHERE pn.phone_number1 = ?
  `
  const contacts = await env.DB.prepare(query)
    .bind(env.user.id, env.user.phoneNumber)
    .all<Required<UserDB>>()

  const userMessagingDO = userStorage(env, env.user.id)
  const chatListResponse = await userMessagingDO.fetch(
    new Request(`${env.ORIGIN}/${env.user.id}/client/request/chats`, {
      method: 'POST',
      body: '{}',
    }),
  )

  const chatList = await chatListResponse.json<ChatList>()
  const chatListIds = chatList.filter(chat => chat.type === 'dialog').map(chat => chat.id)

  const chatListUsers = { results: [] as Required<UserDB>[] }
  if (chatListIds.length > 0) {
    for (let i = 0; i < chatListIds.length; i += 10) {
      const chunk = chatListIds.slice(i, i + 10)
      const chatListUsersQuery = `
        SELECT u.*
        FROM users u
        WHERE id IN (${chunk.map(() => '?').join(',')})
      `
      const chunkResults = await env.DB.prepare(chatListUsersQuery)
        .bind(...chunk)
        .all<Required<UserDB>>()
      chatListUsers.results.push(...chunkResults.results)
    }
  }

  const combinedResults = [...contacts.results, ...chatListUsers.results]

  const uniqueResults = combinedResults.reduce<Required<UserDB>[]>((acc, current) => {
    const x = acc.find(item => item.id === current.id)
    if (!x) {
      acc.push(current)
    }
    return acc
  }, [])

  const lastSeens: Map<string, number | undefined> = new Map()
  const promises = []
  for (const contact of uniqueResults) {
    const contactFromChatList = chatList.find(chat => chat.id === contact.id)
    if (contactFromChatList) {
      lastSeens.set(contact.id, contactFromChatList.lastSeen)
    } else {
      const mdo = userStorage(env, contact.id)
      promises.push(async () => {
        const lastSeenResponse = await mdo.fetch(
          new Request(`${env.ORIGIN}/${contact.id}/client/request/lastSeen`, {
            method: 'POST',
          }),
        )

        const lastSeen = await lastSeenResponse.json<OnlineStatus>()
        if (lastSeen.status === 'offline') {
          lastSeens.set(contact.id, lastSeen.lastSeen || UNKNOWN_LAST_SEEN)
        }
      })
    }
  }
  await Promise.all(promises)

  const results = uniqueResults.map(contact => {
    return {
      id: contact.id,
      phoneNumber: contact.phone_number,
      firstName: contact.first_name || undefined,
      lastName: contact.last_name || undefined,
      username: contact.username || undefined,
      avatarUrl: contact.avatar_url || undefined,
      verified: !!(contact.verified || false),
      lastSeen: lastSeens.get(contact.id),
    }
  })

  return results.filter(u => u.firstName || u.lastName || u.username)
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
