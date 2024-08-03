import { z } from 'zod'
import { errorResponses } from '~/types/openapi-schemas/error-responses'
import { ProfileWithLastSeenSchema } from '~/types/openapi-schemas/profile'
import { errorResponse } from '~/utils/error-response'
import { Route } from '~/utils/route'
import { getMergedContacts } from '../services/contacts'
import { Env } from '../types/Env'
import { jsonResp } from '@cloudflare/itty-router-openapi'

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
          contacts: z.array(ProfileWithLastSeenSchema),
        }),
      },
      ...errorResponses,
    },
  }

  async handle(request: Request, env: Env) {
    try {
      const mergedContacts = await getMergedContacts(env)
      return jsonResp({ contacts: mergedContacts })
    } catch (error) {
      return errorResponse(JSON.stringify({ error: (error as Error).message }))
    }
  }
}
