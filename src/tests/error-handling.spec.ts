import { describe, it, expect } from 'vitest'
import axios from 'axios'

const baseUrl = 'https://dev.iambig.ai'

describe('Error Handling Tests', () => {
  it('should handle 404 errors', async () => {
    try {
      await axios.get(`${baseUrl}/non-existent-endpoint`)
    } catch (error: any) {
      expect(error.response.status).toBe(404)
    }
  })

  it('should handle 500 errors', async () => {
    try {
      await axios.get(`${baseUrl}/trigger-500-error`)
    } catch (error: any) {
      expect(error.response.status).toBe(500)
    }
  })
})
