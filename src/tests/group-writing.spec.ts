import { describe, it, expect, vi, beforeAll } from 'vitest'
import { loremIpsum } from 'lorem-ipsum'
import axios from 'axios'
import WebSocket from 'ws'
import { newId } from '../utils/new-id'
import { generateAccessToken } from '../services/jwt'

const GROUP = 'lHPBMB___Sv75USysZEnJxx1'

const JWT_SECRET = 'secret'

describe('all is friends', () => {
  it(
    'group',
    async () => {
      //const baseUrl = 'http://localhost:8787'
      const baseUrl = 'https://dev.iambig.ai'
      console.log('!!')
      // Step 1: Verify the test phone number and get tokens
      const accessToken = await generateAccessToken(
        { id: '+9999996c', phoneNumber: '' },
        JWT_SECRET,
      )
      console.log(accessToken)

      const res = await axios.get(
        `${baseUrl}/chat?chatId=${GROUP}`,

        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        },
      )
      const users = res.data.meta.participants
      console.log(res.data)

      for (const user1 of users) {
        const accessToken1 = await generateAccessToken(user1, JWT_SECRET)

        const resp = await Promise.resolve(
          axios
            .post(
              `${baseUrl}/messages`,
              {
                chatId: GROUP,
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
    },
    { timeout: 500000 },
  )
})
