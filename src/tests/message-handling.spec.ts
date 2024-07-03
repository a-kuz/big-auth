import { describe, it, expect, beforeAll } from 'vitest'
import axios from 'axios'

const baseUrl = 'https://dev.iambig.ai'
let accessToken1: string
let accessToken2: string
const randomPhoneNumber1 = `+999${Math.floor(Math.random() * 1000000)}`
const randomPhoneNumber2 = `+999${Math.floor(Math.random() * 1000000)}`

beforeAll(async () => {
  const response1 = await axios.post(`${baseUrl}/verify-code`, {
    phoneNumber: randomPhoneNumber1,
    code: '000000',
  })
  accessToken1 = response1.data.accessToken

  const response2 = await axios.post(`${baseUrl}/verify-code`, {
    phoneNumber: randomPhoneNumber2,
    code: '000000',
  })
  accessToken2 = response2.data.accessToken
  accessToken2 = response2.data.accessToken
})

describe('Message Handling Tests', () => {
  it('should handle message flow between two users', async () => {
    // User 1 sends 10 messages to User 2
    for (let i = 0; i < 10; i++) {
      const response = await axios.post(
        `${baseUrl}/messages`,
        { chatId: 'chat123', message: `Message ${i + 1}` },
        { headers: { Authorization: `Bearer ${accessToken1}` } },
      )
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty('messageId')
    }

    // User 2 marks messages as delivered
    for (let i = 0; i < 10; i++) {
      const response = await axios.post(
        `${baseUrl}/messages/delivered`,
        { chatId: 'chat123', messageId: i + 1 },
        { headers: { Authorization: `Bearer ${accessToken2}` } },
      )
      expect(response.status).toBe(200)
    }

    // User 1 sends 5 more messages to User 2
    for (let i = 10; i < 15; i++) {
      const response = await axios.post(
        `${baseUrl}/messages`,
        { chatId: 'chat123', message: `Message ${i + 1}` },
        { headers: { Authorization: `Bearer ${accessToken1}` } },
      )
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty('messageId')
    }

    // User 2 marks the reading of the seventh message
    const response = await axios.post(
      `${baseUrl}/messages/read`,
      { chatId: 'chat123', messageId: 7 },
      { headers: { Authorization: `Bearer ${accessToken2}` } },
    )
    expect(response.status).toBe(200)

    // User 1 sends 10 more messages to User 2
    for (let i = 15; i < 25; i++) {
      const response = await axios.post(
        `${baseUrl}/messages`,
        { chatId: 'chat123', message: `Message ${i + 1}` },
        { headers: { Authorization: `Bearer ${accessToken1}` } },
      )
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty('messageId')
    }
  })
})
