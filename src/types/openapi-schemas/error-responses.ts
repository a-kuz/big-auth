import { OpenAPIRouteSchema } from '@cloudflare/itty-router-openapi'
import { ZodError, z } from 'zod'

export const errorResponses: OpenAPIRouteSchema['responses'] = {
  400: {
    description: 'Validation error',
    contentType: 'application/json',
    schema: z.object({
      error: z.array(z.instanceof<typeof ZodError>(z.ZodError)),
      timestamp: z.number().describe('Miilisconds since UNIX epoch').default(Date.now()),
      status: z.number({ coerce: true }).default(400).describe('HTTP status code'),
    }),
  },
  401: {
    description: 'Unauthorized',
    contentType: 'application/json',
    schema: z.object({
      error: z.string().default('Unauthorized'),
      timestamp: z.number().describe('Miilisconds since UNIX epoch').default(Date.now()),
      status: z.number({ coerce: true }).default(401).describe('HTTP status code'),
    }),
  },
  500: {
    description: 'Internal server error',
    contentType: 'application/json',
    schema: z.object({
      error: z.string().default('Something went wrong'),
      timestamp: z.number().describe('Miilisconds since UNIX epoch').default(Date.now()),
      status: z.number({ coerce: true }).default(500).describe('HTTP status code'),
    }),
  },
}
