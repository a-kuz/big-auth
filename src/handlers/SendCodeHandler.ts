import { OpenAPIRoute, Str } from "@cloudflare/itty-router-openapi";
import { TWILIO_BASE_URL } from "../constants";
import { Env } from "../types";
import { errorResponse } from "../utils/error-response";

interface Message {
  phoneNumber: string;
}

interface Req {
  body: Message;
}

export class SendCodeHandler extends OpenAPIRoute {
  static schema = {
    tags: ["OTP"],
    summary: "Send code via Twilio",
    requestBody: {
      phoneNumber: new Str({ example: "+34627068478" }),
    },
    responses: {
      "200": {
        description: "Message sent successfully",
        schema: {},
      },
    },
  };

  async handle(_request: Request, env: Env, _ctx: any, { body }: Req) {
    const { phoneNumber } = body; // Assuming data is already validated and parsed based on the schema
    const url = `${TWILIO_BASE_URL}/${env.TWILIO_SERVICE_SID}/Verifications`;
    const authHeader =
      "Basic " + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: phoneNumber,
          Channel: "sms",
        }),
      });

      return new Response(JSON.stringify(await response.json()), {
        status: response.status,
      });
    } catch (error) {
      return errorResponse('Failed to send OTP');
    }
  }
}
