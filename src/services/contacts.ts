import { Profile, User, UserDB } from '~/db/models/User'
import { Env } from '~/types/Env'
import { fromSnakeToCamel } from '~/utils/name-сases'
import { newId } from '~/utils/new-id'

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
  for (const pn of newNumbers) {
    try {
      await DB.prepare(insertQuery).bind(user.phoneNumber, pn).run()
    } catch (error) {
      // Handle error
      console.error(error)
      throw error
    }

    const contact = contacts.find(c => c.phoneNumber === pn)
    if (contact) {
    }
  }
}

export async function createContact(env: Env, contact: any) {
  const { clientId, userId, phoneNumber, userName, firstName, lastName, avatarUrl, ownerId } =
    contact
  // Validate that user_id exists in the Users table
  const userExistsQuery = 'SELECT COUNT(*) as count FROM users WHERE id = ?'
  const userExistsResult = await env.DB.prepare(userExistsQuery).bind(userId).first()
  if (!userExistsResult || userExistsResult.count === 0) {
    throw new Error('User ID does not exist in the Users table')
  }

  // Validate that there is no existing record with the same user_id for the given owner_id
  const existingContactQuery =
    'SELECT COUNT(*) as count FROM contacts WHERE user_id = ? AND owner_id = ?'
  const existingContactResult = await env.DB.prepare(existingContactQuery)
    .bind(userId, ownerId)
    .first()
  if (existingContactResult) {
    throw new Error('A contact with this user_id already exists for the given owner_id')
  }

  const id = newId()
  const insertQuery = `
    INSERT INTO contacts (id, client_id, user_id, phone_number, user_name, first_name, last_name, avatar_url, owner_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  await env.DB.prepare(insertQuery)
    .bind(id, clientId, userId, phoneNumber, userName, firstName, lastName, avatarUrl, ownerId)
    .run()
  return { id, ...contact }
}

export async function getContacts(env: Env, ownerId: string) {
  const query = 'SELECT * FROM contacts WHERE owner_id = ?'
  const contacts = await env.DB.prepare(query).bind(ownerId).all()
  return contacts.results.map(fromSnakeToCamel)
}

export async function getContactById(env: Env, id: string, ownerId: string) {
  const query = 'SELECT * FROM contacts WHERE id = ? AND owner_id = ?'
  const contact = await env.DB.prepare(query).bind(id, ownerId).first()
  return contact ? fromSnakeToCamel(contact) : null
}

export async function updateContact(env: Env, id: string, updates: any, ownerId: string) {
  const { clientId, userId, phoneNumber, userName, firstName, lastName, avatarUrl } = updates
  const updateQuery = `
    UPDATE contacts
    SET client_id = ?, user_id = ?, phone_number = ?, user_name = ?, first_name = ?, last_name = ?, avatar_url = ?
    WHERE id = ? AND owner_id = ?
  `
  const result = await env.DB.prepare(updateQuery)
    .bind(clientId, userId, phoneNumber, userName, firstName, lastName, avatarUrl, id, ownerId)
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
