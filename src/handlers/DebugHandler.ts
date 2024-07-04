import {
  chatStorage,
  dialogStorage,
  fingerprintDO,
  userStorage,
} from '~/durable-objects/messaging/utils/mdo'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { DebugLogger } from 'util'
import { DebugWrapper } from '~/durable-objects/DebugWrapper'
import { DialogsDO } from '~/durable-objects/messaging'

export const DebugListKeysHandler = async (request: Request, env: Env, ..._args: any[]) => {
  try {
    const url = request.url.replace(/.*rNAs9NggcY8L6pQhymboT\//g, '')
    const parts = url.split('/')
    const userId = parts[0]
    const doType = parts[1] as 'user' | 'chat'
    const name = parts[2]
    const prefix = parts[3]

    let stub //: DurableObjectStub<DebugWrapper>
    if (doType === 'user') {
      stub = userStorage(env, userId)
      return stub.fetch(`http://www.ru/${userId}/client/request/chats`)
    } else if (doType === 'chat') {
      stub = chatStorage(env, name, userId)
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
    const userId = decodeURIComponent(parts[0])
    const chatId = decodeURIComponent(parts[2])
    const variable = decodeURIComponent(parts[3])

    const stub = chatStorage(env, chatId, userId) as DurableObjectStub<DialogsDO>

    return new Response(await stub.debugInfo(), {headers: { 'Content-Type': 'application/json' }})
  } catch (error) {
    console.error(error)
    return errorResponse('Something went wrong')
  }
}
export const DebugRunCodeHandler = async (request: Request, env: Env, ..._args: any[]) => {
  try {
    const code = await request.text()
    const url = request.url.replace(/.*rNAs9NggcY8L6pQhymboM\//g, '')
    const parts = url.split('/')
    const userId = decodeURIComponent(parts[0])
    const chatId = decodeURIComponent(parts[2])
    const variable = decodeURIComponent(parts[3])

    let stub //: DurableObjectStub<DebugWrapper>

    stub = chatStorage(env, chatId, userId)
    const resp = await stub.run(code)
    return new Response(JSON.stringify(resp))
  } catch (error) {
    console.error(error)
    return errorResponse('Something went wrong')
  }
}
