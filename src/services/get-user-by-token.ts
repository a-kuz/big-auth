import jwt from '@tsndr/cloudflare-worker-jwt'
import { User } from '../db/models/User'
import { getUserById } from '../db/services/get-user'
import { UnauthorizedError } from '~/errors/UnauthorizedError'

export const getUserByToken = async (
  d1: D1Database,
  token: string,
  secret: string,
): Promise<User> => {
  try {
    const isValid = await jwt.verify(token, secret)
    if (!isValid) {
      throw new UnauthorizedError()
    }
  } catch (e) {
    console.error(e)
    throw new UnauthorizedError()
  }
  const decoded = await jwt.decode(token)
  if (!decoded?.payload?.sub) {
    throw new UnauthorizedError()
  }

  const userId = decoded.payload.sub

  try {
    return getUserById(d1, userId, new UnauthorizedError(), 'get-user-by-token')
  } catch (e) {
    console.error(e)
  }
  throw new UnauthorizedError()
}
