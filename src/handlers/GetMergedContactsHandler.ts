import { Bool, DataOf, jsonResp, Query } from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import { userStorageById } from '~/durable-objects/messaging/utils/get-durable-object'
import { errorResponses } from '~/types/openapi-schemas/error-responses'
import { ProfileWithLastSeenSchema } from '~/types/openapi-schemas/profile'
import { errorResponse } from '~/utils/error-response'
import { Route } from '~/utils/route'
import { writeErrorLog } from '~/utils/serialize-error'
import { Env } from '../types/Env'

export class ContactsHandler extends Route {
  static schema = {
    tags: ['contacts'],
    summary: 'Get Merged Contacts',
    description: 'Fetches and merges contacts from various sources.',
    parameters: {
      includeChatList: Query(Bool, { default: true }),
    },
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

  async handle(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
    data: DataOf<typeof ContactsHandler.schema>,
  ) {
    try {
      const contacts = await userStorageById(env, env.user.id).contactsRequest(
        !(data.query.includeChatList === false),
      )
      return jsonResp({ contacts })
    } catch (error) {
      await writeErrorLog(error)
      return errorResponse(JSON.stringify({ error: (error as Error).message }))
    }
  }
}
