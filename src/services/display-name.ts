import { DialogMeta } from '~/types/Chat'

export function displayName(chatMeta: DialogMeta): string {
  const { firstName = '', lastName = '', phoneNumber = '', username = '' } = chatMeta
  if (firstName || lastName) {
    return `${firstName} ${lastName}`.trim()
  } else if (username) {
    return `@${username}`
  } else if (phoneNumber) {
    return `${phoneNumber}`
  }
  return "????"
}
