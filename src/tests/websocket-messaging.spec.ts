import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import WebSocket from 'ws'

import { loremIpsum } from 'lorem-ipsum'
import { generateAccessToken } from '../services/jwt'
import { newId } from '../utils/new-id'

const users = [
  
  {
    id: '+99991234567ya',
  },

  
  {
    id: 'bS8JHietAb5O4l7KvGIwf',
  },

  
  {
    id: '5K-WhjVwGsFC2PAegPVDa',
  },
]
//const WS_URL = 'ws://localhost:8787/websocket'
const WS_URL = 'wss://dev.iambig.ai/websocket'

describe('WebSocket Messaging Test', async () => {
  let sockets: WebSocket[] = []
  let tokens: string[] = []

  beforeAll(async () => {
    // Generate tokens for each test user
    tokens = await Promise.all(
      users.map(async u => await generateAccessToken({ id: u.id, phoneNumber: '' }, 'secret')),
    )
  })

  afterAll(() => {
    // Close all WebSocket connections
    sockets.forEach(socket => socket.close())
  })

  it(
    'should establish multiple WebSocket connections and send messages',
    async () => {
      // Establish WebSocket connections
      sockets = tokens.map(token => {
        const ws = new WebSocket(`${WS_URL}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        ws.on('open', () => console.log(`WebSocket connection opened for token: ${token}`))
        ws.on('close', () => console.log(`WebSocket connection closed for token: ${token}`))
        ws.on('error', error => console.error(`WebSocket error for token: ${token}`, error))
        return ws
      })

      // Wait for all connections to be established
      await new Promise(resolve => setTimeout(resolve, 1000))

      const sendFuncrion = () => {
        sockets.forEach(socket => {
          const message = {
            payloadType: 'new',
            payload: {
              message: loremIpsum(),
              clientMessageId: newId(),
              chatId: users[Math.floor(Math.random() * users.length)].id,
            },
            type: 'request',
            id: newId(),
          }
          socket.send(JSON.stringify(message))
        })
        setTimeout(sendFuncrion, 100 + Math.floor(Math.random() * 1000))
      }
      setTimeout(sendFuncrion, 100 + Math.floor(Math.random() * 1000))
      // Send "new" messages every second and "read" messages every two seconds

      const sendReadInterval = setInterval(
        () => {
          sockets.forEach(socket => {
            const message = {
              type: 'request',
              payloadType: 'read',
              payload: { chatId: users[Math.floor(Math.random() * users.length)].id },
            }

            socket.send(JSON.stringify(message))
          })
        },
        2000 + 100 + Math.floor(Math.random() * 1000),
      )

      // Wait for the first WebSocket connection to break or 5 minutes to pass
      const timeout = new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000))
      const closePromise = new Promise(resolve => {
        sockets.forEach(socket => {
          socket.on('close', resolve)
          socket.on('error', resolve)
        })
      })

      await Promise.race([timeout, closePromise])

      // Clear intervals

      clearInterval(sendReadInterval)

      // Expect at least one WebSocket connection to have closed
      const closedSockets = sockets.filter(socket => socket.readyState === WebSocket.CLOSED)
      expect(closedSockets.length).toBeGreaterThan(0)
    },
    { timeout: 60 * 60 * 1000 },
  )
})
