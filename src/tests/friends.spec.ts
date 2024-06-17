import { describe, it, expect, vi, beforeAll } from 'vitest'
import { loremIpsum } from 'lorem-ipsum'
import axios from 'axios'
import WebSocket from 'ws'
import { newId } from '../utils/new-id'
import { generateAccessToken } from '../services/jwt'
import { User } from '../db/models/User'

const users = [
  {
    id: 'd3mgIxBcSqVSeS2Krs1-C',
    phone_number: '+9992358441',
    avatar_url:
      'https://dev.iambig.ai/public/41c8e875bf2693e62332ce61dc5d0bf6106e3e78cb418051b79056cd3eb6b52b',
    first_name: 'RT',
  },
  {
    id: 'F4tny3I08QwjsczeI8fcv',
    phone_number: '+9992',
    avatar_url:
      'https://dev.iambig.ai/public/99042c762e26e63afc37de198c8a60bbae3272b1ea5125f01cbdb6b9d70ab37e',
    first_name: '9992',
  },
  {
    id: 'ww4CnSn16C7qYJMLwKB0l',
    phone_number: '+9993241212',
    avatar_url:
      'https://dev.iambig.ai/public/41c8e875bf2693e62332ce61dc5d0bf6106e3e78cb418051b79056cd3eb6b52b',
    first_name: 'RY',
  },
  {
    id: 'pb3y0eo6keOEHWVvOcLvg',
    phone_number: '+9992551454',
    avatar_url: '',
    first_name: 'Sofia ',
  },
  {
    id: 'A50uPqQxxcVd_LGu0ulMz',
    phone_number: '+9994522131',
    avatar_url:
      'https://dev.iambig.ai/public/db957f30a4410e7cb85e40ff5e198dc73e5b1a9fda814048da14aa0f056d73b8',
    first_name: 'RN',
  },
  {
    id: 'ElK7A8S9xxfLUhUm9oJ3v',
    phone_number: '+9992222288',
    avatar_url: '',
    first_name: 'Sofia',
  },
  {
    id: 'QdrMAU3vX_dgZnoTYfI6c',
    phone_number: '+9992542121',
    avatar_url: '',
    first_name: 'RN',
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
          const accessToken1 = await generateAccessToken(User.fromDb(user1), JWT_SECRET)
          if (user1 == user2) continue

          Promise.resolve(
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
              .then(resp => console.log(resp.data)),
          )
        }
      }
    },
    { timeout: 500000 },
  )
})
