import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
  Str,
  DataOf,
  Bool,
} from '@cloudflare/itty-router-openapi'
import { Route } from '~/utils/route'
import { Env } from '../types/Env'
import { createContact } from '../services/contacts'
import { errorResponse } from '../utils/error-response'
import { errorResponses } from '../types/openapi-schemas/error-responses'
import { fromSnakeToCamel } from '~/utils/name-сases'
import { newId } from '~/utils/new-id'
import { z } from 'zod'
import { serializeError } from 'serialize-error'
import { writeErrorLog } from '~/utils/serialize-error'
import { normalize } from 'path'
import { normalizePhoneNumber } from '~/utils/normalize-phone-number'
import { profile } from 'console'
import { ProfileSchema } from '~/types/openapi-schemas/profile'
import { getUserById } from '~/db/services/get-user'

export class CreateContactHandler extends Route {
  static schema = {
    tags: ['contacts'],
    summary: 'Create a new contact',
    requestBody: z.object({
      clientId: new Str({ required: false }),
      phoneNumber: new Str({ required: true }),
      username: new Str({ required: false }),
      firstName: new Str({ required: false }),
      lastName: new Str({ required: false }),
      avatarUrl: new Str({ required: false }),
    }),
    responses: {
      '200': {
        description: 'Contact created successfully',
        schema: {
          result: new Bool({ required: true }).default(true),
          profile: ProfileSchema,
        },
      },
      '400': {
        description: 'Bad Request',
      },
      ...errorResponses,
    },
    security: [{ BearerAuth: [] }],
  }

  async handle(
    request: Request,
    env: Env,
    _ctx: any,
    data: DataOf<typeof CreateContactHandler.schema>,
  ) {
    try {
      const { clientId, phoneNumber, username, firstName, lastName, avatarUrl } = data.body

      const ownerId = env.user.id
      const contact = {
        clientId,
        phoneNumber: normalizePhoneNumber(phoneNumber),
        username,
        firstName,
        lastName,
        avatarUrl,
        ownerId,
      }
      const newContact = fromSnakeToCamel(await createContact(env, contact))
      return new Response(
        JSON.stringify({ result: true, profile: await getUserById(env.DB, newContact.userId) }),
        {
          status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    } catch (error) {
      await writeErrorLog(error)
      return errorResponse((error as Error).message, 400)
    }
  }
}
