import { getUserById } from '~/db/services/get-user'
import { displayName } from '~/services/display-name'

export const dialogNameAndAvatar = async (
  id: string,
  DB: D1Database,
): Promise<[string, string?]> => {
  let cache = dialogNameCaches.get(id)
  if (cache) {
    if (Date.now() - cache.timestamp < 10 * 60 * 1000) {
      return cache.v
    } else {
      dialogNameCaches.delete(id)
      cache = undefined
    }
  }

  try {
    const user = await getUserById(DB, id)
    const result: NameAndAvatar = [displayName(user), user.avatarUrl]
    dialogNameCaches.set(id, {v:result, timestamp: Date.now())
    return result as [string, string?]
  } catch (e) {
    return ['@' + id, undefined]
  }
}
const dialogNameCaches = new Map<string, { v: NameAndAvatar; timestamp: number }>()
type NameAndAvatar = [string, string?]
