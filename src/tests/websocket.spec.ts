import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import WebSocket from 'ws'
import axios from 'axios'

const baseUrl = 'https://dev.iambig.ai'
let accessToken: string
let ws: WebSocket

beforeAll(async () => {
  const response = await axios.post(`${baseUrl}/verify-code`, {
    phoneNumber: '+99901234567',
    code: '000000',
  })
  accessToken = response.data.accessToken
  ws = new WebSocket(`${baseUrl.replace('https', 'wss')}/websocket`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
})

afterAll(() => {
  ws.close()
})

describe('WebSocket Tests', () => {
  it('should establish WebSocket connection', (done: any) => {
    ws.on('open', () => {
      expect(ws.readyState).toBe(WebSocket.OPEN)
      done()
    })
  })

  it('should send and receive messages via WebSocket', (done: any) => {
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString())
      expect(message).toHaveProperty('type')
      done()
    })

    ws.send(
      JSON.stringify({
        type: 'request',
        timestamp: Date.now(),
        id: 'messageId-1',
        payloadType: 'new',
        payload: {
          chatId: 'chat123',
          message: 'Hello, WebSocket!',
          clientMessageId: 'clientMessageId-1',
        },
      }),
    )
  })

  it('should handle WebSocket disconnections', (done: any) => {
    ws.on('close', () => {
      expect(ws.readyState).toBe(WebSocket.CLOSED)
      done()
    })
    ws.close()
  })
})
