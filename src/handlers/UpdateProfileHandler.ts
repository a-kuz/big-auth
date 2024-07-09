import { DataOf, Str } from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import { userStorage } from '~/durable-objects/messaging/utils/mdo'
import { errorResponses } from '~/types/openapi-schemas/error-responses'
import { ProfileSchema } from '~/types/openapi-schemas/profile'
import { UserId } from '~/types/ws/internal'
import { ClientRequestPayload, ServerResponsePayload } from '~/types/ws/payload-types'
import { Route } from '~/utils/route'
import { writeErrorLog } from '~/utils/serialize-error'
import { updateUser } from '../db/services/update-user'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { REGEX_URL_FILTER } from '~/constants'

export class UpdateProfileHandler extends Route {
  static schema = {
    summary: 'Update own profile',
    tags: ['profile'],
    requestBody: z.object({
      username: new Str({ required: false }),
      firstName: new Str({ required: false }),
      lastName: new Str({ required: false }),
      avatarUrl: z.string().regex(REGEX_URL_FILTER, {message: "url must be at iambig.ai"}).optional(),
    }),
    responses: {
      '200': {
        description: 'Profile updated successfully',
        schema: ProfileSchema,
      },
      ...errorResponses,
    },
    security: [{ BearerAuth: [] }],
  }

  async handle(
    request: Request,
    env: Env,
    context: any,
    data: DataOf<typeof UpdateProfileHandler.schema>,
  ) {
    try {
      const user = env.user
      const {
        username = undefined,
        firstName = undefined,
        lastName = undefined,
        avatarUrl = undefined,
      } = data.body

      if (
        (firstName === '' && !lastName && !user.firstName && !user.lastName) ||
        (lastName === '' && !firstName && !user.firstName && !user.lastName) ||
        (!user.firstName && !user.lastName && !lastName && !firstName) ||
        (lastName === '' && firstName === '')
      ) {
        return errorResponse('firstName or lastName must be defined', 400)
      }

      const updatedUser = await updateUser(env.DB, user.id, data.body)

      const storage = await userStorage(env, user.id)
      await storage.fetch(
        new Request(`${env.ORIGIN}/${user.id}/client/request/updateProfile`, {
          method: 'POST',
          body: JSON.stringify(updatedUser.profile()),
        }),
      )

      const responseBody = updatedUser.profile()

      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    } catch (error) {
      await writeErrorLog(error)
      return errorResponse('Failed to update profile')
    }
  }
}

export const userStorageRpcRequest = async <
  Resp extends ServerResponsePayload,
  Req extends ClientRequestPayload | Object,
>(
  env: Env,
  userId: string,
  method: string,
  requestBody: Req,
  from = 'client',
  type = 'reqest',
): Promise<Resp> => {
  const storage = userStorage(env, userId as UserId)
  const resp = await storage.fetch(
    new Request(`${env.ORIGIN}/${userId}/${from}/${type}/${method}`, {
      method: 'POST',
      body: JSON.stringify(requestBody),
    }),
  )
  return resp.json<Resp>()
}
