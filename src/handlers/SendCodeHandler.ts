import { OpenAPIRoute, Str } from '@cloudflare/itty-router-openapi'
import { TEST_NUMBERS, TWILIO_BASE_URL } from '../constants'
import { Env } from '../types/Env'
import { errorResponse } from '../utils/error-response'
import { normalizePhoneNumber } from '../utils/normalize-phone-number'

interface Message {
  phoneNumber: string
}

interface Req {
  body: Message
}

export class SendCodeHandler extends OpenAPIRoute {
  static schema = {
    tags: ['auth'],
    summary: 'Send OTP',
    requestBody: {
      phoneNumber: new Str({ example: '+99999999999' }),
    },
    responses: {
      '200': {
        description: 'Message sent successfully',
        schema: {},
      },
    },
  }

  async handle(_request: Request, env: Env, _ctx: any, { body }: Req) {
    // Normalize the phone number to ensure consistency
    const phoneNumber = normalizePhoneNumber(body.phoneNumber)

    if (TEST_NUMBERS.includes(phoneNumber) || phoneNumber.startsWith('+999')) {
      return new Response('{}', { status: 200 })
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

      // Return Twilio's response as a JSON object with the appropriate status code
      return new Response(JSON.stringify(await response.json()), {
        status: response.status,
      })
    } catch (error) {
      // In case of an error, return a standardized error response
      return errorResponse('Failed to send OTP')
    }
  }
}
