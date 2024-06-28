import { User, UserDB } from '../models/User'
import { newId } from '../../utils/new-id'
import { splitArray } from '../../utils/split-array'
import { normalizePhoneNumber } from '../../utils/normalize-phone-number'
import { UnauthorizedError } from '~/errors/UnauthorizedError'
import { CustomError } from '~/errors/CustomError'
import { serializeError } from 'serialize-error'

export const getOrCreateUserByPhone = async (
  d1: D1Database,
  phoneNumber: string,
): Promise<User> => {
  const query = 'SELECT * FROM users WHERE phone_number = ? and deleted_at is null'
  try {
    const existingUser = await d1.prepare(query).bind(phoneNumber).first<UserDB>()

    if (!existingUser) {
      const insertQuery = 'INSERT INTO users (id, phone_number, created_at) VALUES (?, ?, ?)'
      const id = phoneNumber.startsWith('+9999') ? phoneNumber + newId(2) : newId()
      const createdAt = Math.floor(Date.now() / 1000)
      await d1.prepare(insertQuery).bind(id, phoneNumber, createdAt).run()
      return new User(id, phoneNumber)
    } else {
      return User.fromDb(existingUser)
    }
  } catch (error) {
    // Handle error
    console.error(error)
    throw new Error('Failed to retrieve or insert user by phone number')
  }
}
export const getUserById = async (
  d1: D1Database,
  id: string,
  error: CustomError = new UnauthorizedError(`User not found ${JSON.stringify({ id })}`),
): Promise<User> => {
  const query = 'SELECT * FROM users WHERE id = ? and deleted_at is null'
  try {
    const existingUser = await d1.prepare(query).bind(id).first<UserDB>()

    if (!existingUser) {
      throw error
    } else {
      return User.fromDb(existingUser)
    }
  } catch (error) {
    // Handle error
    console.error(error)
    throw error
  }
}

export const getUserByPhoneNumbers = async (
  d1: D1Database,
  phoneNumbersBig: string[],
): Promise<User[]> => {
  const normalized = phoneNumbersBig.map(normalizePhoneNumber)
  const chunks = splitArray(
    normalized.filter((e, i) => normalized.indexOf(e) === i),
    10,
  )
  const result: User[] = []
  const promises: Promise<User[]>[] = []
  for (const phoneNumbers of chunks) {
    promises.push(
      new Promise(async resolve => {
        const placeholders = phoneNumbers.map(() => '?').join(',')
        const query = `SELECT * FROM users WHERE phone_number IN (${placeholders}) and deleted_at is null`

        try {
          const users = await d1
            .prepare(query)
            .bind(...phoneNumbers)
            .all<UserDB>()
          resolve(users.results.map(User.fromDb))
        } catch (error) {
          console.error('Failed to retrieve users by phone numbers:', serializeError(error))
          throw new Error('Failed to retrieve users by phone numbers')
        }
      }),
    )
  }
  return (await Promise.all(promises)).flat()
}
