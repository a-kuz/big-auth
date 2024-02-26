import { OpenAPIRoute, Str } from "@cloudflare/itty-router-openapi";
import { instanceToPlain } from "class-transformer";
import { TEST_NUMBERS, TWILIO_BASE_URL } from "../constants";
import { getUser } from "../services/get-user";
import { generateAccessToken } from "../services/jwt";
import { Env } from "../types";
import { errorResponse } from "../utils/error-response";

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
    tags: ["OTP"],
    summary: "Verify an code",
    requestBody: {
      phoneNumber: new Str({ example: "+34627068478" }),
      code: new Str({ example: "000000" }),
    },
    responses: {
      "200": {
        description: "OTP verification successful",
        schema: {
          token: new Str({
            example:
              "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJGLXl1Z01uN1A1d0RNYmpjcGVaN1AiLCJwaG9uZSI6MzQ2MjcwNjg0NzgsIm5iZiI6MTcwODgxNzY0OSwiZXhwIjoxNzExNDA5NjQ5LCJpYXQiOjE3MDg4MTc2NDl9.FAqILei0iXB0lAZP41hUYZTnLZcHQX2O560P9YM4QGQ",
          }),
        },
      },
      "400": {
        description: "incorrect code",
        schema: { message: "code is incorrect" },
      },
    },
  };

  async handle(
    _request: Request,
    env: Env,
    _context: any,
    data: Record<string, any>,
  ) {
    const { phoneNumber, code } = data.body;

    try {
      if (!(TEST_NUMBERS.includes(phoneNumber) && code === "000000")) {
        const verificationResult = await this.verifyCodeWithTwilio(
          phoneNumber,
          code,
          env,
        );
        if (verificationResult !== "approved") {
          return new Response(JSON.stringify({ error: "Incorrect code" }), {
            status: 400,
          });
        }
      }
      const user = await getUser(env.DB, phoneNumber);
      return new Response(
        JSON.stringify({
          token: await generateAccessToken(user, env.JWT_SECRET),
          profile: instanceToPlain(user),
        }),
        { status: 200 },
      );
    } catch (error) {
      console.error(error);
      return errorResponse("Failed to verify OTP", 500);
    }
  }

  async verifyCodeWithTwilio(
    phoneNumber: string,
    code: string,
    env: Env,
  ): Promise<"pending" | "approved" | string> {
    const url = `${TWILIO_BASE_URL}/${env.TWILIO_SERVICE_SID}/VerificationCheck`;
    const authHeader = `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phoneNumber, Code: code }),
    });

    const responseData = (await response.json()) as {
      status: "pending" | "approved" | string;
    };

    return responseData.status;
  }
}
