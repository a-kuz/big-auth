import { Profile, User } from '~/db/models/User'
import { Env } from '~/types/Env'
import { sendMessage } from './send-message'
import { newId } from '~/utils/new-id'
import { userStorage } from '~/durable-objects/messaging/utils/mdo'
import { GetMessagesResponse } from '~/types/ws/client-requests'

type pRow = {
  phone_number1: string
  phone_number2: string
}

export async function putContacts(
  user: User,
  phoneNumbers: string[],
  contacts: Profile[],
  env: Env,
) {
  const DB = env.DB
  const query = 'SELECT * FROM phone_numbers WHERE phone_number1 = ?'
  let existing: pRow[]
  try {
    existing = (await DB.prepare(query).bind(user.phoneNumber).all<pRow>()).results
  } catch (error) {
    // Handle error
    console.error(error)
    existing = []
  }

  const newNumbers = phoneNumbers.filter(pn => !existing.find(e => e.phone_number2 === pn))

  const insertQuery = 'INSERT INTO phone_numbers (phone_number1, phone_number2) VALUES (?, ?)'
  for (const pn of newNumbers) {
    try {
      await DB.prepare(insertQuery).bind(user.phoneNumber, pn).run()
    } catch (error) {
      // Handle error
      console.error(error)
      throw error
    }

    const contact = contacts.find(c => c.phoneNumber === pn)
    if (contact) {
      const userMessagingDO = userStorage(env, user.id)
      const m = await (
        await userMessagingDO.fetch(
          new Request(`${env.ORIGIN}/${user.id}/client/request/messages`, {
            method: 'POST',
            body: JSON.stringify({ chatId: contact.id, count: 1 }),
          }),
        )
      ).json<GetMessagesResponse>()
      if (!m.messages.length) {
        sendMessage(
          {
            chatId: contact.id,
            clientMessageId: newId(),
            message: '👋 чат создан автоматически',
          },
          env,
        )
      }
    }
  }
}
