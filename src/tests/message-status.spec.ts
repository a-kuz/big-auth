import { beforeAll, describe, expect, it, vi } from 'vitest'

import { User } from '../db/models/User'
import { ChatList } from '../types/ChatList'
import { Env } from '../types/Env'

import { GetMessagesResponse } from '../types/ws/client-requests'
import { nanoid } from 'nanoid'
import { WebSocket } from 'ws'

async function delay(ms: number) {
  const ex = Date.now() + ms
  await vi.waitFor(
    () => {
      Date.now() > ex
    },
    {
      timeout: ms + 500, // default is 1000
      interval: 20, // default is 50
    },
  )

  return new Promise(resolve => setTimeout(resolve, ms))
}
const s = ''
const domain = 'localhost:8787'
// const domain = 'dev.iambig.ai'
const baseUrl = `http${s}://${domain}`
const wsUrl = `ws${s}://${domain}/websocket`

describe('Message Status Tests', () => {
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
    // Get JWTs for user1 and user2

    const { accessToken, id } = await verifyCode(randomPhoneNumber2, '000000')
    user2Jwt = accessToken
    user2Id = id
    const { accessToken: acc1, id: id1 } = await verifyCode(randomPhoneNumber1, '000000')
    user1Jwt = acc1
    user1Id = id1
    

  
    env = {
      ORIGIN: baseUrl,
      user: new User(user1Id, randomPhoneNumber1),
      // other env variables
    }
  })

  it(
    'should correctly update message statuses',
    { timeout: 600000, concurrent: true },
    async () => {
      // User1 sends a message to User2
      const messageBody = {
        chatId: user2Id,
        message: 'Hello, User2!',
        clientMessageId: 'msg1',
      }
      const resp = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Jwt}` },
        body: JSON.stringify(messageBody),
      })

      console.log(await resp.json())
      // Check status on User1 side in chat list
      let chatList = await getChatList(user1Jwt)
      expect(chatList.find(chat => chat.id === user2Id)?.lastMessageStatus).toBe('undelivered')

      // Check status on User2 side in chat list
      chatList = await getChatList(user2Jwt)
      expect(chatList.find(chat => chat.id === user1Id)?.lastMessageStatus).toBe('undelivered')

      // Check status on User1 side in messages
      let messages = await getMessages(user1Jwt, user2Id)
      expect(messages[0].status).toBe('undelivered')

      // User2 marks message delivery
      await fetch(`${baseUrl}/blink`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${user2Jwt}` },
      })
      // await delay(2000)

      // Check status on User1 side in chat list
      chatList = await getChatList(user1Jwt)
      expect(chatList.find(chat => chat.id === user2Id)?.lastMessageStatus).toBe('unread')

      // Check status on User2 side in chat list
      chatList = await getChatList(user2Jwt)
      expect(chatList.find(chat => chat.id === user1Id)?.lastMessageStatus).toBe('unread')

      // Check status on User1 side in messages
      messages = await getMessages(user1Jwt, user2Id)
      expect(messages[0].status).toBe('unread')

      // User2 sends a message to User1
      env.user!.id = user2Id
      const messageBody2 = {
        chatId: user1Id,
        message: 'Hello, User1!',
        clientMessageId: 'msg2',
      }
      await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user2Jwt}` },
        body: JSON.stringify(messageBody2),
      })

      ws1 = new WebSocket(wsUrl, { headers: { Authorization: `Bearer ${user1Jwt}` } })
      ws2 = new WebSocket(wsUrl, { headers: { Authorization: `Bearer ${user2Jwt}` } })
      await new Promise(resolve => ws1.on('open', resolve))
      await new Promise(resolve => ws2.on('open', resolve))
      ws1.on('message', (m)=>console.log(m.toString()))
      ws2.on('message', (m)=>console.log(m.toString()))
      await delay(1000)

      // Check status on User1 side in chat list
      chatList = await getChatList(user1Jwt)
      expect(chatList.find(chat => chat.id === user2Id)?.lastMessageStatus).toBe('unread')

      // Check status on User2 side in chat list
      chatList = await getChatList(user2Jwt)
      expect(chatList.find(chat => chat.id === user1Id)?.lastMessageStatus).toBe('unread')
      await delay(1000)
      // Check status on User1 side in messages
      messages = await getMessages(user2Jwt, user1Id)
      
      expect(messages[1].status).toBe('unread')
      read(ws2, user1Id)
      
      await delay(4000)
      
      messages = await getMessages(user1Jwt, user2Id)
      console.log(messages)
      expect(messages[0].status).toBe('read')
      read(ws1, user2Id)
      messages = await getMessages(user2Jwt, user1Id)
      console.log(messages)
      expect(messages[1].status).toBe('read')
    },
  )
})

async function verifyCode(phoneNumber: string, code: string) {
  const response = await fetch(`${baseUrl}/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber, code }),
  })
  const data = await response.json()
  return { accessToken: data.accessToken, id: data.profile.id }
}

async function getChatList(jwt: string): Promise<ChatList> {
  const response = await fetch(`${baseUrl}/chats`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${jwt}` },
  })
  console.log(jwt)
  return (await response.json()) as ChatList
}

async function getMessages(jwt: string, chatId: string): Promise<any[]> {
  const response = await fetch(`${baseUrl}/messages?chatId=${chatId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${jwt}` },
  })
  return ((await response.json()) as GetMessagesResponse).messages
}

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