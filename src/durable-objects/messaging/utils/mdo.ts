import { Env } from '~/types/Env'
import { UserId } from '~/types/ws/internal'

export const userStorage = ({ USER_MESSAGING_DO }: Env, userId: UserId) => {
  const id = USER_MESSAGING_DO.idFromName(userId)
  return USER_MESSAGING_DO.get(id)
}

export const dialogStorage = ({ DIALOG_DO }: Env, name: string) => {
  const id = DIALOG_DO.idFromName(name)
  return DIALOG_DO.get(id, { locationHint: 'weur' })
}

export const groupStorage = ({ GROUP_CHATS_DO }: Env, name: string) => {
  const id = GROUP_CHATS_DO.idFromName(name)
  return GROUP_CHATS_DO.get(id, { locationHint: 'weur' })
}

export const gptStorage = ({ GPT_DO }: Env, name: string) => {
  const id = GPT_DO.idFromName(name)
  return GPT_DO.get(id, { locationHint: 'weur' })
}
export const pushStorage = ({ PUSH_DO }: Env, name: string) => {
  const id = PUSH_DO.idFromName(name)
  return PUSH_DO.get(id, { locationHint: 'weur' })
}

export const chatStorage = (env: Env, chatId: string, userId: string) => {
  return chatId === 'AI'
    ? gptStorage(env, userId)
    : isGroup(chatId)
      ? groupStorage(env, chatId)
      : dialogStorage(env, [chatId, userId].sort((a, b) => (a > b ? 1 : -1)).join(':'))
}

export const chatType = (id: string) => (id === 'AI' ? 'ai' : id.length > 21 ? 'group' : 'dialog')

export const isGroup = (id: string): boolean => chatType(id) === 'group'
