import { Profile, User } from '~/db/models/User'
import { Env } from '~/types/Env'
import { sendMessage } from './send-message'
import { newId } from '~/utils/new-id'
import { userStorage } from '~/durable-objects/messaging/utils/mdo'
import { GetMessagesResponse } from '~/types/ws/client-requests'

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
import { fromSnakeToCamel } from '~/utils/name-сases';
import { Env } from '~/types/Env';

export async function createContact(env: Env, contact: any) {
  const { clientId, userId, phoneNumber, userName, firstName, lastName, avatarUrl, ownerId } = contact;
  const id = newId();
  const insertQuery = `
    INSERT INTO contacts (id, client_id, user_id, phone_number, user_name, first_name, last_name, avatar_url, owner_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await env.DB.prepare(insertQuery).bind(id, clientId, userId, phoneNumber, userName, firstName, lastName, avatarUrl, ownerId).run();
  return { id, ...contact };
}

export async function getContacts(env: Env, ownerId: string) {
  const query = 'SELECT * FROM contacts WHERE owner_id = ?';
  const contacts = await env.DB.prepare(query).bind(ownerId).all();
  return contacts.results.map(fromSnakeToCamel);
}

export async function getContactById(env: Env, id: string, ownerId: string) {
  const query = 'SELECT * FROM contacts WHERE id = ? AND owner_id = ?';
  const contact = await env.DB.prepare(query).bind(id, ownerId).first();
  return contact ? fromSnakeToCamel(contact) : null;
}

export async function updateContact(env: Env, id: string, updates: any, ownerId: string) {
  const { clientId, userId, phoneNumber, userName, firstName, lastName, avatarUrl } = updates;
  const updateQuery = `
    UPDATE contacts
    SET client_id = ?, user_id = ?, phone_number = ?, user_name = ?, first_name = ?, last_name = ?, avatar_url = ?
    WHERE id = ? AND owner_id = ?
  `;
  const result = await env.DB.prepare(updateQuery).bind(clientId, userId, phoneNumber, userName, firstName, lastName, avatarUrl, id, ownerId).run();
  return result.changes > 0 ? { id, ...updates } : null;
}

export async function deleteContact(env: Env, id: string, ownerId: string) {
  const deleteQuery = 'DELETE FROM contacts WHERE id = ? AND owner_id = ?';
  const result = await env.DB.prepare(deleteQuery).bind(id, ownerId).run();
  return result.changes > 0;
}
