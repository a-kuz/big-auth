// import { describe, it, expect, beforeAll } from 'vitest'
// import axios from 'axios'
// import * as FormData from 'form-data'
// import fs from 'fs'

// const baseUrl = 'https://dev.iambig.ai'
// let accessToken: string

// beforeAll(async () => {
//   const response = await axios.post(`${baseUrl}/verify-code`, {
//     phoneNumber: '+99901234567',
//     code: '000000',
//   })
//   accessToken = response.data.accessToken
// })

// describe('File Handling Tests', () => {
//   it('should upload a file', async () => {
//     const form = new FormData()
//     form.append('file', fs.createReadStream('path/to/file.txt'))

//     const response = await axios.post(`${baseUrl}/public/upload`, form, {
//       headers: {
//         ...form.getHeaders(),
//         Authorization: `Bearer ${accessToken}`,
//       },
//     })
//     expect(response.status).toBe(200)
//     expect(response.data).toHaveProperty('url')
//   })

//   it('should retrieve a file', async () => {
//     const response = await axios.get(`${baseUrl}/public/fileId123`, {
//       headers: { Authorization: `Bearer ${accessToken}` },
//     })
//     expect(response.status).toBe(200)
//   })
// })
