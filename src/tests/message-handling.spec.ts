import { describe, it, expect, beforeAll } from 'vitest'
import axios from 'axios'

const baseUrl = 'https://dev.iambig.ai'
let accessToken: string

beforeAll(async () => {
  const response = await axios.post(`${baseUrl}/verify-code`, {
    phoneNumber: '+99901234567',
    code: '000000',
  })
  accessToken = response.data.accessToken
})

describe('Message Handling Tests', () => {
  it('should send a new message', async () => {
    const response = await axios.post(
      `${baseUrl}/messages`,
      { chatId: 'chat123', message: 'Hello' },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    expect(response.status).toBe(200)
    expect(response.data).toHaveProperty('messageId')
  })

  it('should retrieve messages in a chat', async () => {
    const response = await axios.get(`${baseUrl}/messages?chatId=chat123`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(response.status).toBe(200)
    expect(response.data).toHaveProperty('messages')
  })

  it('should mark messages as read', async () => {
    const response = await axios.post(
      `${baseUrl}/messages/read`,
      { chatId: 'chat123', messageId: 1 },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    expect(response.status).toBe(200)
  })

  it('should mark messages as delivered', async () => {
    const response = await axios.post(
      `${baseUrl}/messages/delivered`,
      { chatId: 'chat123', messageId: 1 },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    expect(response.status).toBe(200)
  })

  it('should prevent XSS in messages', async () => {
    const response = await axios.post(
      `${baseUrl}/messages`,
      { chatId: 'chat123', message: '<script>alert("XSS")</script>' },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    expect(response.status).toBe(400)
  })
})
