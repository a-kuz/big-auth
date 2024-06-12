import { describe, it, expect, beforeAll } from 'vitest'
import axios from 'axios'

const baseUrl = 'https://dev.iambig.ai'

describe('Authentication Tests', () => {
  it('should login successfully with valid credentials', async () => {
    const response = await axios.post(`${baseUrl}/verify-code`, {
      phoneNumber: '+99901234567',
      code: '000000',
    })
    expect(response.status).toBe(200)
    expect(response.data).toHaveProperty('accessToken')
  })

  it('should fail login with invalid credentials', async () => {
    try {
      await axios.post(`${baseUrl}/verify-code`, {
        phoneNumber: '+99901234567',
        code: 'wrongcode',
      })
    } catch (error: any) {
      expect(error.response.status).toBe(400)
    }
  })

  it('should refresh token successfully', async () => {
    const loginResponse = await axios.post(`${baseUrl}/verify-code`, {
      phoneNumber: '+99901234567',
      code: '000000',
    })
    const { refreshToken } = loginResponse.data
    const refreshResponse = await axios.post(`${baseUrl}/auth/refresh`, {
      refreshToken,
    })
    expect(refreshResponse.status).toBe(200)
    expect(refreshResponse.data).toHaveProperty('accessToken')
  })
})
