import { describe, it, expect, vi } from 'vitest'
import { loremIpsum } from 'lorem-ipsum'
import axios from 'axios'
import WebSocket from 'ws'
import { newId } from '../utils/new-id'

const COUNT = 15
// const USER1 = '+79875425970'
const USER1 = '+999'
//const USER2 = '+33609570605'
// const USER2 = '+33609570605'
// const USER2 = '+79875425970'
const GROUP = 'xW8Ev7KAQ-z6KJRTcT5B_z2O'

describe('WebSocket Chat Integration Test', () => {
  it(
    'should send and receive messages via WebSocket concurrently',
    async () => {
      //const baseUrl = 'http://localhost:8787'
      const baseUrl = 'https://dev.iambig.ai'
      // Step 1: Verify thbe test phone number and get tokens
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

      // Step 2: Connect to WebSocket using the accessToken
      const ws = new WebSocket(`wss://${baseUrl.replace(/https?\:\/\//, '')}/websocket`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      // Mock WebSocket functions
      vi.spyOn(ws, 'send')
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
                    chatId: GROUP, // Example chat ID
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

        ws.on('message', data => {
          const response = JSON.parse(data.toString())
          console.log(response.payload)

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
            ws.close()
            resolve()
          }
        })
      })

      // Assertions to ensure messages were sent and handled
      expect(ws.send).toHaveBeenCalledTimes(messagesToSend)
      expect(ws.close).toHaveBeenCalled()
    },
    { timeout: 50000 },
  )
})
