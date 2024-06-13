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

describe('User Profile Tests', () => {
  it('should retrieve user profile', async () => {
    const response = await axios.get(`${baseUrl}/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(response.status).toBe(200)
    expect(response.data).toHaveProperty('id')
  })

  it('should update user profile', async () => {
    const response = await axios.post(
      `${baseUrl}/profile`,
      { firstName: 'John', lastName: 'Doe' },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    expect(response.status).toBe(200)
    expect(response.data.firstName).toBe('John')
    expect(response.data.lastName).toBe('Doe')
  })

  it('should handle unauthorized access to profile', async () => {
    try {
      await axios.get(`${baseUrl}/profile`)
    } catch (error: any) {
      expect(error.response.status).toBe(401)
    }
  })

  it('should prevent SQL injection in profile retrieval', async () => {
    try {
      await axios.get(`${baseUrl}/profile?id=' OR '1'='1`)
    } catch (error: any) {
      expect(error.response.status).toBe(400)
    }
  })
})
