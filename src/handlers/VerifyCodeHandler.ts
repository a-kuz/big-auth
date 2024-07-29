import { DataOf, Str } from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import { ProfileSchema } from '~/types/openapi-schemas/profile'
import { Route } from '~/utils/route'
import { TEST_NUMBERS, TWILIO_BASE_URL } from '../constants'
import { getOrCreateUserByPhone } from '../db/services/get-user'
import { generateAccessToken, generateRefreshToken } from '../services/jwt'
import { Env } from '../types/Env'
import { errorResponses } from '../types/openapi-schemas/error-responses'
import { errorResponse } from '../utils/error-response'
import { userStorageById } from '~/durable-objects/messaging/utils/get-durable-object'

export interface VerifyOTPRequestBody {
  phoneNumber: string
  code: string
}

export interface OTPResponse {
  success: boolean
  message?: string
}

export class VerifyCodeHandler extends Route {
  static schema = {
    tags: ['auth'],
    summary: 'Verify OTP',
    requestBody: z.object({
      phoneNumber: z.string().startsWith('+').openapi({ example: '+99901234567' }),
      code: z.string().openapi({ example: '000000' }),
    }),
    responses: {
      '200': {
        description: 'OTP verification successful',
        schema: z.object({
          accessToken: new Str({
            example:
              'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJGLXl1Z01uN1A1d0RNYmpjcGVaN1AiLCJwaG9uZSI6MzQ2MjcwNjg0NzgsIm5iZiI6MTcwODgxNzY0OSwiZXhwIjoxNzExNDA5NjQ5LCJpYXQiOjE3MDg4MTc2NDl9.FAqILei0iXB0lAZP41hUYZTnLZcHQX2O560P9YM4QGQ',
          }),
          refreshToken: new Str({
            example: 'TnLZcHQX2O560P9YM4QGQ',
          }),
					profile: ProfileSchema
        }),
      },
      ...errorResponses,
    },
  }

  async handle(
    request: Request,
    env: Env,
    _context: any,
    { body }: DataOf<typeof VerifyCodeHandler.schema>,
  ) {
    const { phoneNumber, code } = body

    try {
      if (
        !(
          (TEST_NUMBERS.includes(phoneNumber) || phoneNumber.startsWith('+999')) &&
          code === '000000'
        )
      ) {
        const verificationResult = await this.verifyCodeWithTwilio(phoneNumber, code, env)
        if (verificationResult !== 'approved') {
          return errorResponse('Incorrect code' as string, 400)
        }
      }
      // Get or create user by phone number
      const user = await getOrCreateUserByPhone(env.DB, phoneNumber)
      // Generate access and refresh tokens
      const accessToken = await generateAccessToken(user, env.JWT_SECRET)
      const refreshToken = await generateRefreshToken(user.id)

      // Store the refresh token in a Durable Object
      const id = env.REFRESH_TOKEN_DO.idFromName(user.id)
      const refreshTokenDO = env.REFRESH_TOKEN_DO.get(id)

      const row = {
        refreshToken,
        fingerprint: request.headers.get('fingerprint'),
        userId: user.id,
        phoneNumber: user.phoneNumber,
        ip: request.cf?.hostMetadata,
      }

      await refreshTokenDO.fetch(
        new Request(`${request.url}`, {
          method: 'POST',
          body: JSON.stringify(row),
        }),
      )

      await userStorageById(env, user.id).setUserId(user.id)

      return new Response(
        JSON.stringify({
          accessToken,
          refreshToken,
          profile: user.profile(),
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )
    } catch (error) {
      console.error(error)
      return errorResponse('Failed to verify OTP', 500)
    }
  }

  async verifyCodeWithTwilio(
    phoneNumber: string,
    code: string,
    env: Env,
  ): Promise<'pending' | 'approved' | string> {
    // Construct the request to Twilio for code verification
    const url = `${TWILIO_BASE_URL}/${env.TWILIO_SERVICE_SID}/VerificationCheck`
    const authHeader = `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phoneNumber, Code: code }),
    })

    const responseData = (await response.json()) as {
      status: 'pending' | 'approved' | string
    }
    console.log(responseData)

    return responseData.status
  }
}
