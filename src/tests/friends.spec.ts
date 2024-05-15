import { describe, it, expect, vi, beforeAll } from 'vitest'
import { loremIpsum } from 'lorem-ipsum'
import axios from 'axios'
import WebSocket from 'ws'
import { newId } from '../utils/new-id'
import { generateAccessToken } from '../services/jwt'

const users = [
  {
    id: '+99990Q6',
  },
  {
    id: '+99991234567ya',
  },
  {
    id: '+99999Sg',
  },
  {
    id: '+9999Cy',
  },
  {
    id: '+9999bs',
  },
  {
    id: '5K-WhjVwGsFC2PAegPVDa',
  },
  {
    id: '8qhPIzkREZ0rIA7rgFTcT',
  },
  {
    id: 'GDd8UaEOPtlCnHMRGwLwp',
  },
  {
    id: 'NVdhds2Zdh5Rn95BUp7Qt',
  },
  {
    id: 'OgbVi7nMn6AzD8EYEVxS7',
  },
  {
    id: 'Ynvo5sMXSnq4bQK3-8sMn',
  },
  {
    id: 'b2Qqlyc0LB7AkHxqfgo-5',
  },
  {
    id: 'bS8JHietAb5O4l7KvGIwf',
  },
  {
    id: 'dDWxgGsNmArgYEyMDFN0a',
  },
  {
    id: 'nAVTLEJ6toDt7IRqtqDlP',
  },
  {
    id: 'pK2SJnJ4haOkXWmbgyymO',
  },
]
const JWT_SECRET = 'secret'

describe('all is friends', () => {
  it(
    'send all from all',
    async () => {
      const baseUrl = 'http://localhost:8787'
      // const baseUrl = 'https://dev.iambig.ai'
      // Step 1: Verify the test phone number and get tokens

      for (const user1 of users) {
        for (const user2 of users) {
          const accessToken1 = await generateAccessToken(user1, JWT_SECRET)
          if (user1 == user2) continue

          const resp = await Promise.resolve(
            axios
              .post(
                `${baseUrl}/messages`,
                {
                  chatId: user2.id,
                  message: loremIpsum(),
                  clientMessageId: newId(),
                },
                {
                  headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    Authorization: `Bearer ${accessToken1}`,
                  },
                },
              )
              .then(resp => console.log(resp)),
          )
        }
      }
    },
    { timeout: 500000 },
  )
})
