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

describe('Durable Object Tests', () => {
  it('should create and interact with Durable Objects', async () => {
    const response = await axios.post(
      `${baseUrl}/durable-object`,
      { data: 'test data' },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    expect(response.status).toBe(200)
    expect(response.data).toHaveProperty('id')
  })

  it('should handle Durable Object alarms', async () => {
    // Assuming there's an endpoint to trigger alarms for testing
    const response = await axios.post(
      `${baseUrl}/trigger-alarm`,
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    expect(response.status).toBe(200)
  })
})
