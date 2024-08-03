import { DataOf, jsonResp, Path, Str } from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import { Route } from '~/utils/route'
import { updateContact } from '../services/contacts'
import { Env } from '../types/Env'
import { errorResponses } from '../types/openapi-schemas/error-responses'
import { errorResponse } from '../utils/error-response'
import { REGEX_URL_FILTER } from '~/constants'

export class UpdateContactHandler extends Route {
  static schema = {
    tags: ['contacts'],
    summary: 'Update a contact',
    parameters: { id: Path(Str) },
    requestBody: z.object({
      clientId: new Str({ required: false }),
      userId: new Str({ required: false }),
      phoneNumber: new Str({ required: false, example: '+999' }),
      username: new Str({ required: false }),
      firstName: new Str({ required: false }),
      lastName: new Str({ required: false }),
      avatarUrl: z.string().regex(REGEX_URL_FILTER, {message: "url must be at iambig.ai"}).optional(),
    }),
    responses: {
      '200': {
        description: 'Contact updated successfully',
        schema: {
          id: new Str({ example: 'contactId' }),
        },
      },
      ...errorResponses,
    },
    security: [{ BearerAuth: [] }],
  }

  async handle(
    _request: Request,
    env: Env,
    _ctx: any,
    data: DataOf<typeof UpdateContactHandler.schema>,
  ) {
    try {
      const { id } = data.params
      const { clientId, userId, phoneNumber, username, firstName, lastName, avatarUrl } = data.body
      const ownerId = env.user.id
      const updates = { clientId, userId, phoneNumber, username, firstName, lastName, avatarUrl }
      const updatedContact = await updateContact(env, id, updates, ownerId)
      if (!updatedContact) {
        return errorResponse('Contact not found', 404)
      }
      return jsonResp(updatedContact)
    } catch (error) {
      console.error(error)
      return errorResponse('Failed to update contact', 500)
    }
  }
}
