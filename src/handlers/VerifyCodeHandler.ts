import { Bool, OpenAPIRoute, Str } from '@cloudflare/itty-router-openapi';
import { Twilio } from 'twilio'
import { Env } from '../types';
import { TWILIO_BASE_URL } from '../constants';

export interface VerifyOTPRequestBody {
	phoneNumber: string;
	code: string;
}

export interface OTPResponse {
	success: boolean;
	message?: string;
}

export class VerifyCodeHandler extends OpenAPIRoute {
	static schema = {
		tags: ['OTP'],
		summary: 'Verify an OTP',
		requestBody: {
			phoneNumber: new Str({ example: '+34627068478' }),
			code: new Str({ example: '000000' }),
		},
		responses: {
			'200': {
				description: 'OTP verification successful',
				schema: {},
			},
			'400': {
				description: 'incorrect code',
				schema: {}
			}
		},
	};

	async handle(_request: Request, env: Env, _context: any, data: Record<string, any>) {
		const { phoneNumber, code } = data.body;
		const url = `${TWILIO_BASE_URL}/${env.TWILIO_SERVICE_SID}/VerificationCheck`;
		const authHeader = 'Basic ' + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					Authorization: authHeader,
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					To: phoneNumber,
					Code: code,
				}),
			});

			const responseData = await response.json() as { status: 'pending' | 'approved' | string };
			if (responseData.status === 'pending') {
				return new Response(JSON.stringify({ error: "incorrect code" }), { status: 400 })
			}
			if (responseData.status === 'approved') {
				return new Response(JSON.stringify({ message: "approved" }), { status: 200 })
			}


			return new Response(JSON.stringify({ message: JSON.stringify(responseData), error: responseData.status }), { status: 400 })

		} catch (error) {
			return new Response(JSON.stringify({ error: 'Failed to verify OTP' }), {
				status: 500,
			});
		}
	}
}
