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

describe('Push Notification Tests', () => {
  it('should store device token', async () => {
    const response = await axios.post(
      `${baseUrl}/deviceToken`,
      { deviceToken: 'deviceToken123', fingerprint: 'fingerprint123' },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    expect(response.status).toBe(200)
  })

  it('should send push notifications', async () => {
    // Assuming there's an endpoint to trigger push notifications for testing
    const response = await axios.post(
      `${baseUrl}/send-push`,
      { title: 'Test Notification', body: 'This is a test notification.' },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    expect(response.status).toBe(200)
  })
})
