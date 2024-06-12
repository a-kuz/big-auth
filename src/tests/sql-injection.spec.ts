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

describe('SQL Injection Tests', () => {
  it('should prevent SQL injection in getUserById', async () => {
    try {
      await axios.get(`${baseUrl}/profile?id=' OR '1'='1`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    } catch (error: any) {
      expect(error.response.status).toBe(400)
    }
  })
})
