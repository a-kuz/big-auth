import { MarkDeliveredRequest } from '~/types/ws/client-requests'
import { Env } from '../types/Env'
import { userStorage } from '~/durable-objects/messaging/utils/mdo'

export function markDelivered(body: MarkDeliveredRequest, env: Env) {
  const { chatId, messageId } = body
  const senderDO = userStorage(env, env.user.id)
  const reqBody = JSON.stringify({ chatId, messageId })
  const headers = new Headers({ 'Content-Type': 'application/json' })

  return senderDO.fetch(
    new Request(`${env.ORIGIN}/${env.user.id}/client/request/mark-delivered`, {
      method: 'POST',
      body: reqBody,
      headers,
    }),
  )
}
