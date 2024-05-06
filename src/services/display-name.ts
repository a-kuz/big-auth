import { Dialog } from '~/types/Chat'

export function displayName(chat: Dialog): string {
  const { firstName = '', lastName = '', phoneNumber = '', username = '' } = chat.meta
  if (firstName || lastName) {
    return `${firstName} ${lastName}`.trim()
  } else if (username) {
    return `@${username}`
  } else if (phoneNumber) {
    return `${phoneNumber}`
  }
  return chat.chatId
}
