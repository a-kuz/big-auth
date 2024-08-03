import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'

import { User } from '../db/models/User'
import { ChatList } from '../types/ChatList'
import { Env } from '../types/Env'

import { nanoid } from 'nanoid'
import { GetMessagesResponse } from '../types/ws/client-requests'

async function delay(ms: number) {
  const ex = Date.now() + ms
  await vi.waitFor(
    () => {
      Date.now() > ex
    },
    {
      timeout: ms, // default is 1000
      interval: 20, // default is 50
    },
  )

  return new Promise(resolve => setTimeout(resolve, ms))
}
const s = ''
const domain = 'localhost:8787'
//const domain = 'dev.iambig.ai'
const baseUrl = `http${s}://${domain}`
const wsUrl = `ws${s}://${domain}/websocket`

describe('Chat Missed Tests', { timeout: 30000 }, () => {
  const randomPhoneNumber1 = `+999${Math.floor(Math.random() * 1000000)}`
  const randomPhoneNumber2 = `+999${Math.floor(Math.random() * 1000000)}`

  let env: Partial<Env>
  let user1Jwt: string
  let user2Jwt: string
  let user1Id: string
  let user2Id: string

  let ws1: WebSocket
  let ws2: WebSocket

  beforeAll(async () => {
    const vcResp1 = await verifyCode(randomPhoneNumber1, '000000');
    const vcResp2 = await verifyCode(randomPhoneNumber2, '000000');
    console.log('vcResp', vcResp1, vcResp2);
    const { accessToken, id } = vcResp2
    user2Jwt = accessToken
    user2Id = id
    const { accessToken: acc1, id: id1 } = vcResp1
    user1Jwt = acc1
    user1Id = id1
    await delay(1000) // wait for user to be created in db
    ws1 = new WebSocket(wsUrl, { headers: { Authorization: `Bearer ${user1Jwt}` } })
    ws2 = new WebSocket(wsUrl, { headers: { Authorization: `Bearer ${user2Jwt}` } })
    await new Promise(resolve => ws1.on('open', resolve))
    await new Promise(resolve => ws2.on('open', resolve))
    ws1.on('message', (m)=>console.log(m.toString()))
    ws2.on('message', (m)=>console.log(m.toString()))
    env = {
      ORIGIN: baseUrl,
      user: new User(user1Id, randomPhoneNumber1),
      // other env variables
    }
  }, 60000)

  afterAll(() => {
    ws1.close()
    ws2.close()
  })

  it(
    'should correctly update missed message count',
    { timeout: 600000, concurrent: true },
    async () => {
      await sendMessage(user1Jwt, user2Id, 'U1=>U2, #0')
      expect((await getChatList(user1Jwt)).find(chat => chat.id === user2Id)?.missed).toBe(0)
      expect((await getChatList(user2Jwt)).find(chat => chat.id === user1Id)?.missed).toBe(1)

      await sendMessage(user1Jwt, user2Id, 'U1=>U2, #1')
      expect((await getChatList(user2Jwt)).find(chat => chat.id === user1Id)?.missed).toBe(2)
      
      await sendMessage(user1Jwt, user2Id, 'U1=>U2, #2')
      expect((await getChatList(user2Jwt)).find(chat => chat.id === user1Id)?.missed).toBe(3)
      await sendMessage(user1Jwt, user2Id, 'U1=>U2, #3')
      expect((await getChatList(user2Jwt)).find(chat => chat.id === user1Id)?.missed).toBe(4)
      await sendMessage(user1Jwt, user2Id, 'U1=>U2, #4')
      expect((await getChatList(user2Jwt)).find(chat => chat.id === user1Id)?.missed).toBe(5)
      await sendMessage(user1Jwt, user2Id, 'U1=>U2, #5')
      expect((await getChatList(user2Jwt)).find(chat => chat.id === user1Id)?.missed).toBe(6)
      
      read(ws2, user1Id)
      delay(1500)
      expect((await getChatList(user2Jwt)).find(chat => chat.id === user1Id)?.missed).toBe(0)

      await sendMessage(user2Jwt, user1Id, 'Hello, User1!')
      
      ws1.send(JSON.stringify({ id: nanoid(), payloadType: 'read', payload: { chatId: user2Id } }))
      await delay(200)
      
      expect((await getChatList(user1Jwt)).find(chat => chat.id === user2Id)?.missed).toBe(1)
      
      await sendMessage(user2Jwt, user1Id, 'Hello, User1!')
      expect((await getChatList(user1Jwt)).find(chat => chat.id === user2Id)?.missed).toBe(2)
      
      expect((await getChatList(user2Jwt)).find(chat => chat.id === user1Id)?.missed).toBe(0)
      read(ws1, user2Id)
      await delay(2000)
      expect((await getChatList(user1Jwt)).find(chat => chat.id === user2Id)?.missed).toBe(0)
      await sendMessage(user2Jwt, user1Id, 'Hello, User1!')
      await sendMessage(user2Jwt, user1Id, 'Hello, User1!')
      await sendMessage(user2Jwt, user1Id, 'Hello, User1!')
      await sendMessage(user2Jwt, user1Id, 'Hello, User1!')
      expect((await getChatList(user1Jwt)).find(chat => chat.id === user2Id)?.missed).toBe(4)
      await sendMessage(user1Jwt, user2Id, 'Hello, User2!')
      expect((await getChatList(user2Jwt)).find(chat => chat.id === user1Id)?.missed).toBe(1)
    },
  )
})

function read(ws: WebSocket, chatId: string) {
  ws.send(
    JSON.stringify({
      id: nanoid(),
      type: 'request',
      payloadType: 'read',
      payload: { chatId },
    })
  )
}

async function verifyCode(phoneNumber: string, code: string) {
  const response = await fetch(`${baseUrl}/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber, code }),
  })
  const data = (await response.json()) as { accessToken: string; profile: { id: string } }
  return { accessToken: data.accessToken, id: data.profile.id }
}

async function getChatList(jwt: string): Promise<ChatList> {
  const response = await fetch(`${baseUrl}/chats`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${jwt}` },
  })
  return (await response.json()) as ChatList
}

async function getMessages(jwt: string, chatId: string): Promise<any[]> {
  const response = await fetch(`${baseUrl}/messages?chatId=${chatId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${jwt}` },
  })
  return ((await response.json()) as GetMessagesResponse).messages
}
async function sendMessage(jwt: string, chatId: string, message: string) {
  const messageBody = {
    chatId,
    message,
    clientMessageId: nanoid(),
  }
  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(messageBody),
  })

  const data = await response.json()
  console.log(data)
}
