import { DataOf, jsonResp, OpenAPIRoute, Str } from '@cloudflare/itty-router-openapi'
import { Route } from '~/utils/route'
import { TEST_NUMBERS, TWILIO_BASE_URL } from '../constants'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { normalizePhoneNumber } from '../utils/normalize-phone-number'
import { errorResponses } from '~/types/openapi-schemas/error-responses'
import { z } from 'zod'

export class SendCodeHandler extends Route {
  static schema = {
    tags: ['auth'],
    summary: 'Send OTP',
    requestBody: z.object({
      phoneNumber: new Str({ example: '+99999999999' }),
    }),
    responses: {
      '200': {
        description: 'Message sent successfully',
        schema: {},
      },
      ...errorResponses,
    },
  }

  async handle(
    _request: Request,
    env: Env,
    _ctx: any,
    { body }: DataOf<typeof SendCodeHandler.schema>,
  ) {
    // Normalize the phone number to ensure consistency
    const phoneNumber = normalizePhoneNumber(body.phoneNumber)

    if (TEST_NUMBERS.includes(phoneNumber) || phoneNumber.startsWith('+999')) {
      return new Response('{}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    }

    // Construct the URL for Twilio's Verification API
    const url = `${TWILIO_BASE_URL}/${env.TWILIO_SERVICE_SID}/Verifications`
    // Encode the credentials for Basic Auth
    const authHeader = 'Basic ' + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)

    try {
      // Make a POST request to Twilio's Verification API to send the OTP
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phoneNumber,
          Channel: 'sms', // Let Twilio decide the best channel (SMS or voice) for sending the OTP
        }),
      })

      if (response.status - 200 < 100) {
        // If the request was successful, return a success response
        return jsonResp({})
      } else {
        return errorResponse((await response.text()) as string, response.status)
      }
    } catch (error) {
      // In case of an error, return a standardized error response
      return errorResponse('Failed to send OTP')
    }
  }
}
