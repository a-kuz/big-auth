import { describe, it, expect, vi, beforeAll } from 'vitest'
import { loremIpsum } from 'lorem-ipsum'
import axios from 'axios'
import WebSocket from 'ws'
import { newId } from '../utils/new-id'
import { generateAccessToken } from '../services/jwt'

const users = [
  {
    id: 'bS8JHietAb5O4l7KvGIwf',
    phoneNumber: '+999',
  },
  {
    id: 'OgbVi7nMn6AzD8EYEVxS7',
    phoneNumber: '+99901234567',
  },
  {
    id: '8qhPIzkREZ0rIA7rgFTcT',
    phoneNumber: '+79104445676',
  },
  {
    id: '+99991234567ya',
    phoneNumber: '+99991234567',
  },
  {
    id: '5K-WhjVwGsFC2PAegPVDa',
    phoneNumber: '+79875425970',
  },
  {
    id: 'Ynvo5sMXSnq4bQK3-8sMn',
    phoneNumber: '+9990123456',
  },
  {
    id: '+9999bs',
    phoneNumber: '+9999',
  },
  {
    id: '+9999Cy',
    phoneNumber: '+9999',
  },
  {
    id: 'nAVTLEJ6toDt7IRqtqDlP',
    phoneNumber: '+999123456',
  },
  {
    id: '+99999Sg',
    phoneNumber: '+99999',
  },
  {
    id: 'NVdhds2Zdh5Rn95BUp7Qt',
    phoneNumber: '+9990000000',
  },
  {
    id: 'GDd8UaEOPtlCnHMRGwLwp',
    phoneNumber: '+9991111111',
  },
  {
    id: 'pK2SJnJ4haOkXWmbgyymO',
    phoneNumber: '+33609570605',
  },
  {
    id: 'b5FGw_j3RJISCSZrMOhQh',
    phoneNumber: '+79057020080',
  },
  {
    id: '2sTi-UKUothtkB3QnJNeM',
    phoneNumber: '+9990',
  },
  {
    id: 's3HuSEoBL2AUzM4KXpyhW',
    phoneNumber: '+34627068478',
  },
  {
    id: 'k1fmh-6s_Sd1hlAYS2vpB',
    phoneNumber: '+9992222222',
  },
  {
    id: '+99990L8',
    phoneNumber: '+99990',
  },
]
const JWT_SECRET = 'secret'

describe('all is friends', () => {
  it(
    'send all from all',
    async () => {
      //const baseUrl = 'http://localhost:8787'
      const baseUrl = 'https://dev.iambig.ai'
      // Step 1: Verify the test phone number and get tokens

      for (const user2 of users) {
        for (const user1 of users) {
          const accessToken1 = await generateAccessToken(user1, JWT_SECRET)
          if (user1 == user2) continue

          const resp = await axios.post(
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
          console.log(resp)
        }
      }
    },
    { timeout: 500000 },
  )
})
