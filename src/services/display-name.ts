import { DialogMeta as Profile } from '~/types/Chat'

export function displayName(u: Profile): string {
  const { firstName = '', lastName = '', phoneNumber = '', username = '' } = u
  if (firstName || lastName) {
    return `${firstName} ${lastName}`.trim()
  } else if (username) {
    return `@${username}`
  } else if (phoneNumber) {
    return `${phoneNumber}`
  }
  return '????'
}
