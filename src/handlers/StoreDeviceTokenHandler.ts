import { DataOf, jsonResp } from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import {
  fingerprintDO,
  userStorageById,
} from '~/durable-objects/messaging/utils/get-durable-object'
import { errorResponses } from '~/types/openapi-schemas/error-responses'
import { Route } from '~/utils/route'
import { Env } from '../types/Env'

export class StoreDeviceTokenHandler extends Route {
  static schema = {
    tags: ['device'],
    summary: 'Store device tokens with fingerprint (device id)',
    requestBody: z.object({
      deviceToken: z.string({ description: 'base64 encoded' }),
      tokenType: z.enum(['ios-notification', 'ios-voip']).default('ios-notification').optional(),
      fingerprint: z.string({ description: 'device id' }),
    }),
    responses: {
      200: { description: 'ok', schema: z.object({}) },
      ...errorResponses,
    },
  }

  async handle(
    request: Request,
    env: Env,
    _context: any,
    { body }: DataOf<typeof StoreDeviceTokenHandler.schema>,
  ) {
    const { deviceToken, fingerprint, tokenType = 'ios-notification' } = body

    const tokenStorage = fingerprintDO(env, fingerprint)
    const userId = await tokenStorage.setTokenAndGetUserId(tokenType, deviceToken)

    if (userId) {
      const storage = userStorageById(env, userId)
      switch (tokenType) {
        case 'ios-voip': {
          const VOIP_TOKEN_DO = env.VOIP_TOKEN_DO
          const id = VOIP_TOKEN_DO.idFromName(userId)
          const voipTokenDO = await VOIP_TOKEN_DO.get(id)
          await voipTokenDO.setToken(deviceToken)
          break
        }
        case 'ios-notification': {
          await storage.setDeviceTokenRequest({ fingerprint, deviceToken, type: tokenType })
          break
        }
      }
    }

    return jsonResp({})
  }
}
