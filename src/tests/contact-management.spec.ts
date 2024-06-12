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

describe('Contact Management Tests', () => {
  it('should add a new contact', async () => {
    const response = await axios.post(
      `${baseUrl}/contacts`,
      { phoneNumber: '+99987654321', firstName: 'Jane', lastName: 'Doe' },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    expect(response.status).toBe(200)
    expect(response.data).toHaveProperty('id')
  })

  it('should update a contact', async () => {
    const response = await axios.post(
      `${baseUrl}/contacts/contact123`,
      { firstName: 'Jane', lastName: 'Smith' },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    expect(response.status).toBe(200)
    expect(response.data.firstName).toBe('Jane')
    expect(response.data.lastName).toBe('Smith')
  })

  it('should delete a contact', async () => {
    const response = await axios.delete(`${baseUrl}/contacts/contact123`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(response.status).toBe(200)
  })

  it('should retrieve contact list', async () => {
    const response = await axios.get(`${baseUrl}/contacts`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(response.status).toBe(200)
    expect(response.data).toHaveProperty('contacts')
  })
})
