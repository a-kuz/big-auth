import { OpenAPIRoute, OpenAPIRouteSchema, Str, DataOf } from '@cloudflare/itty-router-openapi'
import { Env } from '../types/Env'
import { createContact } from '../services/contacts'
import { errorResponse } from '../utils/error-response'
import { fromSnakeToCamel } from '~/utils/name-сases'

export class CreateContactHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    tags: ['contacts'],
    summary: 'Create a new contact',
    requestBody: {
      clientId: new Str({ required: false }),
      userId: new Str({ required: false }),
      phoneNumber: new Str({ required: false }),
      userName: new Str({ required: false }),
      firstName: new Str({ required: false }),
      lastName: new Str({ required: false }),
      avatarUrl: new Str({ required: false }),
    },
    responses: {
      '200': {
        description: 'Contact created successfully',
        schema: {
          id: new Str({ example: 'contactId' }),
        },
      },
      '400': {
        description: 'Bad Request',
      },
      '500': {
        description: 'Internal Server Error',
      },
    },
  }

  async handle(request: Request, env: Env, _ctx: any, data: DataOf<typeof CreateContactHandler.schema>) {
    try {
      const { clientId, userId, phoneNumber, userName, firstName, lastName, avatarUrl } = data.body
      const id = newId()
      const ownerId = env.user.id;
      const contact = { clientId, userId, phoneNumber, userName, firstName, lastName, avatarUrl, ownerId };
      const newContact = await createContact(env, contact);
      return new Response(JSON.stringify(fromSnakeToCamel(newContact)), { status: 200 })
    } catch (error) {
      console.error(error)
      return errorResponse('Failed to create contact', 500)
    }
  }
}
