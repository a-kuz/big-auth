import { Num, OpenAPIRoute, Str } from '@cloudflare/itty-router-openapi'
import { Route } from '~/utils/route'
import { z } from 'zod'
import { getMergedContacts } from '../services/contacts'
import { Env } from '../types/Env'
import { ProfileSchema } from '~/types/openapi-schemas/profile'
import { errorResponses } from '~/types/openapi-schemas/error-responses'

export class GetMergedContactsHandler extends Route {
  static schema = {
    tags: ['contacts'],
    summary: 'Get Merged Contacts',
    description: 'Fetches and merges contacts from various sources.',
    security: [{ BearerAuth: [] }],
    responses: {
      '200': {
        description: 'Contact retrieved successfully',
        schema: z.object({
          contacts: ProfileSchema,
        }),
      },
      ...errorResponses,
    },
  }

  async handle(request: Request, env: Env) {
    try {
      const mergedContacts = await getMergedContacts(env)
      return new Response(JSON.stringify({ contacts: mergedContacts }), {
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      return new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }
}
