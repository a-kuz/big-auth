import { describe, it, expect, vi } from 'vitest'
import axios from 'axios'
import WebSocket from 'ws'

describe('WebSocket Chat Integration Test', () => {
  it(
    'should send and receive messages via WebSocket concurrently',
    async () => {
      // Step 1: Verify the test phone number and get tokens
      const verifyResponse = await axios.post(
        'https://dev.iambig.ai/verify-code',
        {
          phoneNumber: '+999',
          code: '000000',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        },
      )

      const { accessToken } = verifyResponse.data

      // Step 2: Connect to WebSocket using the accessToken
      const ws = new WebSocket('wss://dev.iambig.ai/websocket', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      // Mock WebSocket functions
      vi.spyOn(ws, 'send')
      vi.spyOn(ws, 'close')

      const messagesToSend = 100
      let messagesReceived = 0

      await new Promise<void>(resolve => {
        ws.on('open', () => {
          const p = []
          for (let i = 1; i <= messagesToSend; i++) {
            // Send messages with incremented messageId
            p.push(new Promise(resolve=>  {
              const message = {
                type: 'request',
                timestamp: Date.now(),
                id: `messageId-${i}`, // Unique ID for each message
                payloadType: 'new',
                payload: {
                  chatId: 'Xp6ucajJ39P8rhjtgbba', // Example chat ID
                  message: `Message number ${i}`,
                },
              }
							console.log(i)
              ws.send(JSON.stringify(message))
            }))

          }
					Promise.all(p)
        })

        ws.on('message', data => {
          const response = JSON.parse(data.toString())
          console.log(response.payload)

          if (response.type !== 'response') {
            return
          }

          // Check if response has messageId
          expect(response.payload).toHaveProperty('messageId')
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
