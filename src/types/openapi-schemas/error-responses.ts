import { z } from 'zod'

export const errorResponses = {
  401: {
    description: 'Unauthorized',
    contentType: 'application/json',
    schema: z.object({
      error: z.string().default('Unauthorized'),
      timestamp: z.number().describe('Miilisconds since UNIX epoch'),
      status: z.number({ coerce: true }).default(401).describe('HTTP status code'),
    }),
  },
  500: {
    description: 'Internal server error',
    contentType: 'application/json',
    schema: z.object({
      error: z.string().default('Something went wrong'),
      timestamp: z.number().describe('Miilisconds since UNIX epoch'),
      status: z.number({ coerce: true }).default(401).describe('HTTP status code'),
    }),
  },
}
