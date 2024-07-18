import { NewMessageRequest } from '~/types/ws/client-requests'
import { Env } from '../types/Env'
import { userStorage } from '~/durable-objects/messaging/utils/mdo'

export async function sendMessage(body: NewMessageRequest, env: Env) {
  const {
    chatId,
    message,
    attachments = undefined,
    clientMessageId = '',
    replyTo = undefined,
  } = body
  // Retrieve sender and receiver's durable object IDs
  const senderDO = userStorage(env, env.user.id)
  // Create an event object with message details and timestamp
  const req: NewMessageRequest = {
    chatId,
    message,
    attachments,
    clientMessageId,
    replyTo,
  }

  const reqBody = JSON.stringify(req)
  const headers = new Headers({ 'Content-Type': 'application/json' })

  return new Response(JSON.stringify(await senderDO.newRequest(req)), { headers })
}
