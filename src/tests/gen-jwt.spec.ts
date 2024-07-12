import { generateAccessToken } from '../services/jwt'
import jwt from '@tsndr/cloudflare-worker-jwt'

import { Mock, Vitest, expect, it } from 'vitest'
import { describe, mock } from 'node:test'

describe('JWT Generation by Phone Number', () => {
  const secret = 'secret'
  const phoneNumber = '+79220700340'

  it('should generate a valid JWT token', async () => {
    const data = {
      id: 'KpQy-we5yBKYxYP0UJG6T',
      phoneNumber: phoneNumber,
    }

    const token = await generateAccessToken(data, secret)
    console.log(token)
    const isValid = await jwt.verify(token, secret)
    expect(isValid).toBe(true)
  })
})
