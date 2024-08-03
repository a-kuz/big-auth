import { DurableObjectNamespace } from '@cloudflare/workers-types'

import { PhoneNumberDO } from '~/durable-objects/PhoneNumberDO'
import { Arr, DataOf, jsonResp, OpenAPIRouteSchema, Str } from '@cloudflare/itty-router-openapi'
import { Route } from '~/utils/route'
import { Env } from '~/types/Env'
import { z } from 'zod'

export class RegisterOwnContactsHandler extends Route {
  static schema = {
    tags: ['Contacts'],
    summary: 'Register own contacts',
    security: [{ BearerAuth: [] }],
    requestBody: z.object({
      phoneNumbers: z.array(z.string().default('+999')),
    }),
  
    responses: {
      200: {
        description: 'Contacts registered successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
              },
            },
          },
        },
      },
      400: {
        description: 'Invalid input',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'string' },
              },
            },
          },
        },
      },
    
    },
    
  }

  async handle(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
    data: DataOf<typeof RegisterOwnContactsHandler.schema>,
  ): Promise<Response> {
    const { phoneNumbers } = data.body

    const doId = env.PN_DO.idFromName(env.user.phoneNumber)
    const doStub = env.PN_DO.get(doId)
    doStub.setPhoneNumber(env.user.phoneNumber)
    doStub.setUserId(env.user.id)
    await doStub.registerOwnContacts(phoneNumbers)

    return jsonResp(await doStub.getMatchedContacts())
  }
}
