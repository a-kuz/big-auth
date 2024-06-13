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

describe('Chat Management Tests', () => {
  it('should create a new chat', async () => {
    const response = await axios.post(
      `${baseUrl}/chats`,
      { name: 'New Chat', participants: ['user1', 'user2'] },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    expect(response.status).toBe(200)
    expect(response.data).toHaveProperty('groupId')
  })

  it('should retrieve chat details', async () => {
    const response = await axios.get(`${baseUrl}/chat?chatId=chat123`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(response.status).toBe(200)
    expect(response.data).toHaveProperty('chatId')
  })

  it('should retrieve chat list', async () => {
    const response = await axios.get(`${baseUrl}/chats`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(response.status).toBe(200)
    expect(response.data).toHaveProperty('chats')
  })

  it('should prevent XSS in chat creation', async () => {
    const response = await axios.post(
      `${baseUrl}/chats`,
      { name: '<script>alert("XSS")</script>', participants: ['user1', 'user2'] },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    expect(response.status).toBe(400)
  })
})
