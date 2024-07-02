import { describe, it, expect, vi } from 'vitest'
import { loremIpsum } from 'lorem-ipsum'
import axios from 'axios'
import WebSocket from 'ws'
import { newId } from '../utils/new-id'

const COUNT = 100000
// const USER1 = '+79875425970'
// const USER1 = '+34627068478'
const USER2 = '+999'
const USER1 = '+79875425970'
// const USER2 = '+9999'
//const USER2 = '+79875425970'
//const USER2 = '+9999'
const baseUrl = 'http://localhost:8787'
// const baseUrl = 'https://dev.iambig.ai'
describe('WebSocket Chat Integration Test', () => {
  it(
    'should send and receive messages via WebSocket concurrently',
    { timeout: 50000000 },
    async () => {
      // Step 1: Verify the test phone number and get tokens
      console.log('verify-code')
      const verifyResponse = await axios.post(
        `${baseUrl}/verify-code`,
        {
          phoneNumber: USER1,
          code: '000000',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        },
      )

      console.log('verify-code ok')
      const { accessToken } = verifyResponse.data
      console.log(accessToken)
      const verifyResponse2 = await axios.post(
        `${baseUrl}/verify-code`,
        {
          phoneNumber: USER2,
          code: '000000',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        },
      )
      const { refreshToken } = verifyResponse2.data
      // const userId = '+9999Zr'//refreshToken.split(".")[1];
      const userId = refreshToken.split('.')[1]
      console.log(userId)

      // Step 2: Connect to WebSocket using the accessToken
      let ws = new WebSocket(`ws://${baseUrl.replace(/https?\:\/\//, '')}/websocket`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      // Mock WebSocket functions

      vi.spyOn(ws, 'close')

      const messagesToSend = COUNT
      let messagesReceived = 0

      await new Promise<void>(resolve => {
        ws.on('open', () => {
          const p = []
          for (let i = 1; i <= messagesToSend; i++) {
            // Send messages with incremented messageId
            const lorem = loremIpsum()
            p.push(
              new Promise(resolve => {
                const message = {
                  type: 'request',
                  timestamp: Date.now(),
                  id: `messageId-${i * Math.random()}`, // Unique ID for each message
                  payloadType: 'new',
                  payload: {
                    chatId: userId, // Example chat ID
                    message: lorem,
                    clientMessageId: newId(),
                  },
                }
                console.log({ i, lorem })
                ws.send(JSON.stringify(message))
              }),
            )
          }
          Promise.all(p)
        })
        const ids: string[] = []

        setInterval(() => ws.send('ping'), 4000)
        setInterval(() => {
          console.log(ws.readyState)
          const lorem = loremIpsum()

          const message = {
            type: 'request',
            timestamp: Date.now(),
            id: newId(), // Unique ID for each message
            payloadType: 'new',
            payload: {
              chatId: userId, // Example chat ID
              message: lorem,
              clientMessageId: newId(),
            },
          }

          ws.send(JSON.stringify(message))
        }, 4000)
        ws.on('close', (...args) => {
          console.log(args)
          ws.close()
          resolve()
          ws = new WebSocket(`wss://${baseUrl.replace(/https?\:\/\//, '')}/websocket`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
        })
        ws.on('error', (...args) => {
          console.log(args)
        })
        ws.on('message', data => {
          const response = JSON.parse(data.toString())
          console.log(response)

          if (response.type !== 'response') {
            return
          }

          // Check if response has messageId
          expect(response.payload).toHaveProperty('messageId')
          expect(ids).not.contains(response.payload.messageId)
          ids.push(response.payload.messageId)
          messagesReceived++

          // Check if all messages have been received
          if (messagesReceived === messagesToSend) {
            //ws.close()
            //resolve()
          }
        })
      })

      // Assertions to ensure messages were sent and handled
      // expect(ws.send).toHaveBeenCalledTimes(messagesToSend)
      expect(ws.close).toHaveBeenCalled()
    },
  )
})
