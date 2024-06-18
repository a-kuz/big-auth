import { Num, OpenAPIRoute, Str } from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import { getMergedContacts } from '../services/contacts'
import { Env } from '../types/Env'

export class GetMergedContactsHandler extends OpenAPIRoute {
  static schema = {
    tags: ['contacts'],
    summary: 'Get Merged Contacts',
    description: 'Fetches and merges contacts from various sources.',
    security: [{ BearerAuth: [] }],
    responses: {
      '200': {
        description: 'Contact retrieved successfully',
        schema: {
          id: new Str(),
          numericId: new Num(),
          clientId: new Str({ required: false }),
          userId: new Str({ required: false }),
          phoneNumber: new Str({ required: false }),
          userName: new Str({ required: false }),
          firstName: new Str({ required: false }),
          lastName: new Str({ required: false }),
          avatarUrl: new Str({ required: false }),
        },
      },
      '404': {
        description: 'Contact not found',
      },
      '500': {
        description: 'Internal Server Error',
      },
    },
  }

  async handle(request: Request, env: Env) {
    try {
      const mergedContacts = await getMergedContacts(env)
      return new Response(JSON.stringify(mergedContacts), {
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
