import { User } from '~/db/models/User'
import { getUserByToken } from '~/services/get-user-by-token'
import { Env } from '~/types/Env'
import { errorResponse } from '~/utils/error-response'

export function getBearer(request: Request): null | string {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || authHeader.substring(0, 6) !== 'Bearer') {
    return null
  }
  return authHeader.substring(6).trim()
}

export async function authenticateUser(request: Request, env: Env, context: any) {
  const token = getBearer(request)
  let user: User

  if (!token) {
    return errorResponse('Authorization required', 401)
  }

  // Implement your own token validation here
  try {
    user = await getUserByToken(env.DB, token, env.JWT_SECRET)
  } catch (error) {
    console.error(error)
    return errorResponse('Failed to fetch profile', 401)
  }

  if (!user) {
    return errorResponse('user not exist', 401)
  }

  // set the user_id for endpoint routes to be able to reference it
  env.user = user
}
