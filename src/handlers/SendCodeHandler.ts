import { OpenAPIRoute, Str } from '@cloudflare/itty-router-openapi';
import { BASE_URL, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } from '../constants';

interface Message {
	phoneNumber: string;
}

interface Req {
	body: Message;
}

export class SendCodeHandler extends OpenAPIRoute {
	static schema = {
		tags: ["OTP"],
		summary: 'Send code via Twilio',
		requestBody: {
			phoneNumber: new Str({ example: '+34627068478' }),
		},
		responses: {
			'200': {
				description: 'Message sent successfully',
				schema: {},
			},
		},
	};

	async handle(request: Request, env: any, context: any, { body }: Req) {
		const { phoneNumber } = body; // Assuming data is already validated and parsed based on the schema
		const url = `${BASE_URL}/Verifications`;
		const authHeader = 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					Authorization: authHeader,
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					To: phoneNumber,
					Channel: 'sms',
				}),
			});

			return new Response(JSON.stringify(await response.json()), {
				status: response.status,
			});
		} catch (error) {
			return new Response(JSON.stringify({ error: 'Failed to send OTP' }), {
				status: 500,
			});
		}
	}
}
