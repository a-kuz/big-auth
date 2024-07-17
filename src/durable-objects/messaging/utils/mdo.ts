import { Env } from '~/types/Env'
import { UserId } from '~/types/ws/internal'
import { GROUP_ID_LENGTH } from '../constants'


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
export const fingerprintDO = ({ PUSH_TOKEN_DO }: Env, name: string) => {
  const id = PUSH_TOKEN_DO.idFromName(name)
  return PUSH_TOKEN_DO.get(id, { locationHint: 'weur' })
}

export const chatStorage = (env: Env, chatId: string, userId: string) => {
  switch (chatType(chatId)) {
    case 'ai':
      return gptStorage(env, userId)
    case 'group':
      return groupStorage(env, chatId)
    case 'dialog':
      return dialogStorage(env, [chatId, userId].sort((a, b) => (a > b ? 1 : -1)).join(':'))
  }
}

export const chatType = (id: string) =>
  id === 'AI' || id === 'ai' ? 'ai' : id.length === GROUP_ID_LENGTH ? 'group' : 'dialog'

export const isGroup = (id: string): boolean => chatType(id) === 'group'
