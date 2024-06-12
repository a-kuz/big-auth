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

describe('XSS Tests', () => {
  it('should prevent XSS in messages', async () => {
    const response = await axios.post(
      `${baseUrl}/messages`,
      { chatId: 'chat123', message: '<script>alert("XSS")</script>' },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    expect(response.status).toBe(400)
  })
})
