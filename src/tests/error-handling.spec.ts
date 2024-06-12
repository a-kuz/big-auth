import { describe, it, expect } from 'vitest'
import axios from 'axios'

const baseUrl = 'https://dev.iambig.ai'

describe('Error Handling Tests', () => {
  it('should handle 404 errors', async () => {
    try {
      await axios.get(`${baseUrl}/non-existent-endpoint`)
    } catch (error: any) {
      expect(error.response.status).oneOf([404, 401])
    }
  })
})
