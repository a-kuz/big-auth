import { Profile, User } from '~/db/models/User'
import { getUserByToken } from '~/services/get-user-by-token'
import { Env } from '~/types/Env'
import { errorResponse, unauthorized } from '~/utils/error-response'
import { KVNamespace } from '@cloudflare/workers-types'

export function getBearer(request: Request): null | string {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || authHeader.substring(0, 6) !== 'Bearer') {
    return null
  }
  return authHeader.substring(6).trim()
}

export async function authenticateUser(
  request: Request,
  env: Env & { KV: KVNamespace },
  context: any,
) {
  const token = getBearer(request)
  let user: Profile

  if (!token) {
    return unauthorized()
  }

  const cachedUser = await env.KV.get<Profile>(token, { type: 'json' })
  if (cachedUser) {
    user = cachedUser
  } else {
    try {
      user = await getUserByToken(env.DB, token, env.JWT_SECRET)
    } catch (error) {
      console.error(error)
      return errorResponse('Failed to fetch profile', 401)
    }

    if (!user) {
      return unauthorized()
    }

    // Cache the user in KV
    await env.KV.put(token, JSON.stringify(user), { expirationTtl: 3600 * 24 * 30 })
  }

  env.user = User.fromProfile(user)
}
