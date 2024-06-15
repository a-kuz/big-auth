import { DataOf, OpenAPIRoute, Str } from '@cloudflare/itty-router-openapi'
import { instanceToPlain } from 'class-transformer'
import { z } from 'zod'
import { updateUser } from '../db/services/update-user'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { writeErrorLog } from '~/utils/serialize-error'
import { userStorage } from '~/durable-objects/messaging/utils/mdo'

export class UpdateProfileHandler extends OpenAPIRoute {
  static schema = {
    summary: 'Update own profile',
    tags: ['profile'],
    requestBody: z.object({
      username: new Str({ required: false }),
      firstName: new Str({ required: false }),
      lastName: new Str({ required: false }),
      avatarUrl: new Str({ required: false }),
    }),
    responses: {
      '200': {
        description: 'Profile updated successfully',
        schema: {
          id: new Str({ example: 'weEEwwecw_wdx2' }),
          phoneNumber: new Str({ example: '+79333333333' }),
          username: new Str({ required: false, example: '@ask_uznetsov' }),
          firstName: new Str({ required: false, example: 'Aleksandr' }),
          lastName: new Str({ required: false, example: 'Ivanov' }),
          avatarUrl: new Str({
            required: false,
            example: 'https://pics.png/png.png',
          }),
        },
      },
      '400': {
        description: 'Bad Request',
      },
      '401': {
        description: 'Unauthorized',
      },
      '500': {
        description: 'Server Error',
      },
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
        return errorResponse('Please, define firstName or lastName', 400)
      }

      const updatedUser = await updateUser(env.DB, user.id, data.body)

      const storage = await userStorage(env, user.id)
      await storage.fetch(
        new Request(`${env.ORIGIN}/${user.id}/profile/request/updateProfile`, {
          method: 'POST',
          body: JSON.stringify(updatedUser.profile()),
        }),
      )

      return new Response(JSON.stringify(updatedUser.profile()), {
        status: 200,
      })
    } catch (error) {
      await writeErrorLog(error)
      return errorResponse('Failed to update profile')
    }
  }
}
