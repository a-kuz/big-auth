import { generateAccessToken } from '../services/jwt'
import jwt from '@tsndr/cloudflare-worker-jwt'

import { Mock, Vitest, expect, it } from 'vitest'
import { describe, mock } from 'node:test'

describe('JWT Generation by Phone Number', () => {
  const secret = 'secret'
  const phoneNumber = '+79875425970'

  it('should generate a valid JWT token', async () => {
    const data = {
      id: '5K-WhjVwGsFC2PAegPVDa',
      phoneNumber: phoneNumber,
    }

    const token = await generateAccessToken(data, secret)
    console.log(token)
    const isValid = await jwt.verify(token, secret)
    expect(isValid).toBe(true)
  })
})
