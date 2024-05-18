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
    avatar_url:
      'https://dev.iambig.ai/public/a37600b22332d6f06cc371520b73f8ce1c1f9e0657b42da5a36f02c8a0d42e41',
    first_name: '(=',
  },
  {
    id: 'OgbVi7nMn6AzD8EYEVxS7',
    phoneNumber: '+99901234567',
    avatar_url:
      'https://dev.iambig.ai/public/1feb2e3c2d04dec268da0606dd163e76f6869233129be1633ab9937903640818',
    first_name: 'Did ',
  },
  {
    id: '8qhPIzkREZ0rIA7rgFTcT',
    phoneNumber: '+79104445676',
    avatar_url:
      'https://dev.iambig.ai/public/1feb2e3c2d04dec268da0606dd163e76f6869233129be1633ab9937903640818',
    first_name: 'Ddd',
  },
  {
    id: '+99991234567ya',
    phoneNumber: '+99991234567',
    avatar_url:
      'https://dev.iambig.ai/public/1feb2e3c2d04dec268da0606dd163e76f6869233129be1633ab9937903640818',
    first_name: ' ',
  },
  {
    id: '5K-WhjVwGsFC2PAegPVDa',
    phoneNumber: '+79875425970',
    avatar_url:
      'https://dev.iambig.ai/public/205568997e9c76882de09485a15815a3d5fa42bcb334c2e8eccfa7207ede9414',
    first_name: 'Гв',
  },
  {
    id: 'Ynvo5sMXSnq4bQK3-8sMn',
    phoneNumber: '+9990123456',
    avatar_url:
      'https://dev.iambig.ai/public/1feb2e3c2d04dec268da0606dd163e76f6869233129be1633ab9937903640818',
    first_name: 'Ddd',
  },
  {
    id: '+9999bs',
    phoneNumber: '+9999',
    avatar_url: '',
    first_name: '1',
  },
  {
    id: '+9999Cy',
    phoneNumber: '+9999',
    avatar_url:
      'https://dev.iambig.ai/public/1feb2e3c2d04dec268da0606dd163e76f6869233129be1633ab9937903640818',
    first_name: ' ',
  },
  {
    id: 'nAVTLEJ6toDt7IRqtqDlP',
    phoneNumber: '+999123456',
    avatar_url:
      'https://dev.big.a-kuznetsov.cc/public/c8cd65f8ff4d1ff543c02d8149d9f5c658f7e4eb85aca3fc3a65dc6777741e01',
    first_name: 'Hg',
  },
  {
    id: '+99999Sg',
    phoneNumber: '+99999',
    avatar_url:
      'https://dev.iambig.ai/public/c6c35bb579c2c1b10c8d6cd5d3702daab00953f581c105e365393fcffb4e1d4d',
    first_name: 'Alex',
  },
  {
    id: 'NVdhds2Zdh5Rn95BUp7Qt',
    phoneNumber: '+9990000000',
    avatar_url: '',
    first_name: 'О',
  },
  {
    id: 'GDd8UaEOPtlCnHMRGwLwp',
    phoneNumber: '+9991111111',
    avatar_url:
      'https://dev.iambig.ai/public/657f9d30934ce08b62152f23a280e1ddf4d20e53fe814130a3c3836968269220',
    first_name: 'Long name long name long name long name',
  },
  {
    id: 'pK2SJnJ4haOkXWmbgyymO',
    phoneNumber: '+33609570605',
    avatar_url: '',
    first_name: 'AK',
  },
  {
    id: 'b5FGw_j3RJISCSZrMOhQh',
    phoneNumber: '+79057020080',
    avatar_url:
      'https://dev.iambig.ai/public/1feb2e3c2d04dec268da0606dd163e76f6869233129be1633ab9937903640818',
    first_name: 'Sofia',
  },
  {
    id: '2sTi-UKUothtkB3QnJNeM',
    phoneNumber: '+9990',
    avatar_url:
      'https://dev.iambig.ai/public/8110411a06a6dbd1b0e953611490e4194847958d63905339166bf8ae4037cbc9',
    first_name: 'q',
  },
  {
    id: 's3HuSEoBL2AUzM4KXpyhW',
    phoneNumber: '+34627068478',
    avatar_url:
      'https://dev.iambig.ai/public/ba31ce04a722518c8227ddc94b5be7728cb33775901e0f12df244c2d8d45a62a',
    first_name: 'Cat',
  },
  {
    id: 'k1fmh-6s_Sd1hlAYS2vpB',
    phoneNumber: '+9992222222',
    avatar_url:
      'https://dev.iambig.ai/public/1feb2e3c2d04dec268da0606dd163e76f6869233129be1633ab9937903640818',
    first_name: 'Long name long name long name long name long name',
  },
  {
    id: '+99990L8',
    phoneNumber: '+99990',
    avatar_url:
      'https://dev.iambig.ai/public/1feb2e3c2d04dec268da0606dd163e76f6869233129be1633ab9937903640818',
    first_name: ' ',
  },
  {
    id: '+99999999999c5',
    phoneNumber: '+99999999999',
    avatar_url:
      'https://dev.iambig.ai/public/b0595be65c75ce30d988cdbcbb761369a08ffb40374a7b3c9b2bafb9b7537551',
    first_name: 'А',
  },
  {
    id: 'JoPbRO5SynMFzeNA4ckPR',
    phoneNumber: '+9998',
    avatar_url: '',
    first_name: '9998',
  },
  {
    id: '+9999999g9',
    phoneNumber: '+9999999',
    avatar_url: '',
    first_name: 'Nine',
  },
  {
    id: '+999999999C8',
    phoneNumber: '+999999999',
    avatar_url:
      'https://dev.iambig.ai/public/90f1259861958954180abbb1be19083e6a9eeee2e338ec6626e248df371fc671',
    first_name: 'super',
  },
  {
    id: 'CXpzovmbXa_68u9Ir0BR9',
    phoneNumber: '+9992587777',
    avatar_url:
      'https://dev.iambig.ai/public/c1735b748ccad5c68567fd5f0324bfc06ab39efaef7a01cf146e28a970fcec12',
    first_name: 'С',
  },
  {
    id: 'iw_a5j2C85pporLTEndMi',
    phoneNumber: '+9992567777',
    avatar_url:
      'https://dev.iambig.ai/public/e436bfccd477e19a3aa18ab19ffaf02c4dcc50feb63c878bc2229d656d60ff4a',
    first_name: 'AK',
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
