import { DialogsDO, MessagingDO } from '~/durable-objects/messaging'
import { chatStorage, userStorageById } from '~/durable-objects/messaging/utils/get-durable-object'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { domainToASCII } from 'url'
import { DebugableDurableObject } from '~/durable-objects/DebugableDurableObject'
import { RefreshTokenDO } from '~/durable-objects/RefreshTokenDO'

export const DebugListKeysHandler = async (request: Request, env: Env, ..._args: any[]) => {
  try {
    const url = request.url.replace(/.*rNAs9NggcY8L6pQhymboT\//g, '')
    const parts = url.split('/')
    const userId = parts[0]
    const doType = parts[1] as
      | 'user'
      | 'chat'
      | 'PUSH_TOKEN_DO'
      | 'VOIP_TOKEN_DO'
      | 'GPT_DO'
    const name = parts[2]
    const prefix = parts[3]

    let stub : DurableObjectStub<DebugableDurableObject|MessagingDO>
    if (doType === 'user') {
      stub = userStorageById(env, userId)
      return new Response(JSON.stringify(await stub.debugInfo()))
    } else if (doType === 'chat') {
      stub = chatStorage(env, name, userId)
      return new Response(await stub.listKeys({ prefix }), {
        headers: { 'Content-Type': 'application/json' },
      })
    } else {
      let doNamespace: DurableObjectNamespace<DebugableDurableObject>
      switch (doType as 'PUSH_TOKEN_DO' | 'VOIP_TOKEN_DO' | 'GPT_DO') {
        case 'PUSH_TOKEN_DO':
          doNamespace = env.PUSH_TOKEN_DO
          break
      
        case 'VOIP_TOKEN_DO':
          doNamespace = env.VOIP_TOKEN_DO
          break
        case 'GPT_DO':
          doNamespace = env.GPT_DO
          break
        default:
          doNamespace = env[doType]
          break
      }
			stub = doNamespace.get(doNamespace.idFromName(name))
      return new Response(await stub.listKeys({ prefix }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
  } catch (error) {
    console.error(error)
    return errorResponse('Something went wrong')
  }
}
export const DebugMemoryHandler = async (request: Request, env: Env, ..._args: any[]) => {
  try {
    const url = request.url.replace(/.*rNAs9NggcY8L6pQhymboM\//g, '')
    const parts = url.split('/')
    const userId = parts[0]
    const chatId = parts[2]

    const stub = chatStorage(env, chatId, userId) as DurableObjectStub<DialogsDO>

    return new Response(await stub.debugInfo(), { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error(error)
    return errorResponse('Something went wrong')
  }
}
export const DebugClearStorageHandler = async (request: Request, env: Env, ..._args: any[]) => {
  try {
    const url = request.url.replace(/.*rNAs9NggcY8L6pQhymboC\/?/g, '')
    const parts = url.split('/')
    const userId = parts[0]
    const doType = parts[1] as
      | 'PUSH_TOKEN_DO'
      | 'VOIP_TOKEN_DO'
      | 'GPT_DO'
    const name = parts[2]
    const prefix = parts[3]
    const  doNamespace: DurableObjectNamespace<DebugableDurableObject> = env[doType]
    const stub = doNamespace.get(doNamespace.idFromName(name))
    await stub.deleteAll()
    return new Response("", { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error(error)
    return errorResponse('Something went wrong')
  }
}

// { name = "REFRESH_TOKEN_DO", class_name = "RefreshTokenDO" },
// { name = "GROUP_CHATS_DO", class_name = "GroupChatsDO" },
// { name = "USER_MESSAGING_DO", class_name = "UserMessagingDO" },
// { name = "DIALOG_DO", class_name = "DialogsDO" },
// { name = "GPT_DO", class_name = "ChatGptDO" },
// { name = "PUSH_TOKEN_DO", class_name = "PushDO" },
// { name = "VOIP_TOKEN_DO", class_name = "VoipTokenDO" }
