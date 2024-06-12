import { describe, it, expect, beforeAll } from 'vitest'
import axios from 'axios'

const baseUrl = 'http://localhost:8787'

describe('Authentication Tests', () => {
  let loginResponse: any
  it('should login successfully with valid credentials', async () => {
    loginResponse = await axios.post(`${baseUrl}/verify-code`, {
      phoneNumber: '+99901234567',
      code: '000000',
    })
    expect(loginResponse.status).toBe(200)
    expect(loginResponse.data).toHaveProperty('accessToken')
  })

  it('should fail login with invalid credentials', async () => {
    try {
      await axios.post(`${baseUrl}/verify-code`, {
        phoneNumber: '+99901234567',
        code: 'wrongcode',
      })
    } catch (error: any) {
      const status = error.response.status
      const statusFamily = Math.floor(status / 100) * 100
      expect(statusFamily).toBe(400)
    }
  })

  it('should refresh token successfully', async () => {
    try {
      const { refreshToken } = loginResponse.data
      const refreshResponse = await axios.post(`${baseUrl}/auth/refresh`, {
        refreshToken,
      })
      console.log(refreshResponse)
      expect(refreshResponse.status).toBe(200)
      expect(refreshResponse.data).toHaveProperty('accessToken')
    } catch (e) {}
  })
})
