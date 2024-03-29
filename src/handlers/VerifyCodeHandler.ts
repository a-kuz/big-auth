import { OpenAPIRoute, Str } from "@cloudflare/itty-router-openapi";
import { TEST_NUMBERS, TWILIO_BASE_URL } from "../constants";
import { getOrCreateUserByPhone } from "../db/services/get-user";
import { generateAccessToken, generateRefreshToken } from "../services/jwt";
import { Env } from "../types/Env";
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
		tags: ["auth"],
		summary: "Verify OTP",
		requestBody: {
			phoneNumber: new Str({ example: "+99901234567" }),
			code: new Str({ example: "000000" }),
		},
		responses: {
			"200": {
				description: "OTP verification successful",
				schema: {
					accessToken: new Str({
						example:
							"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJGLXl1Z01uN1A1d0RNYmpjcGVaN1AiLCJwaG9uZSI6MzQ2MjcwNjg0NzgsIm5iZiI6MTcwODgxNzY0OSwiZXhwIjoxNzExNDA5NjQ5LCJpYXQiOjE3MDg4MTc2NDl9.FAqILei0iXB0lAZP41hUYZTnLZcHQX2O560P9YM4QGQ",
					}),
					refreshToken: new Str({
						example: "TnLZcHQX2O560P9YM4QGQ",
					}),
				},
			},
			"400": {
				description: "incorrect code",
				schema: { error: "incorrect code" },
			},
		},
	};

	async handle(
		request: Request,
		env: Env,
		_context: any,
		data: Record<string, any>,
	) {
		const { phoneNumber, code } = data.body;

		try {
			// Verify the code with predefined test values or with Twilio
			if (
				!(
					(TEST_NUMBERS.includes(phoneNumber) ||
						phoneNumber.startsWith("+999")) &&
					code === "000000"
				)
			) {
				const verificationResult = await this.verifyCodeWithTwilio(
					phoneNumber,
					code,
					env,
				);
				if (verificationResult !== "approved") {
					return errorResponse("Incorrect code", 400);
				}
			}
			// Get or create user by phone number
			const user = await getOrCreateUserByPhone(env.DB, phoneNumber);
			// Generate access and refresh tokens
			const accessToken = await generateAccessToken(user, env.JWT_SECRET);
			const refreshToken = await generateRefreshToken(user.id);

			// Store the refresh token in a Durable Object
			const id = env.REFRESH_TOKEN_DO.idFromName(user.id);
			const refreshTokenDO = env.REFRESH_TOKEN_DO.get(id);

			const row = {
				refreshToken,
				fingerprint: request.headers.get("fingerprint"),
				userId: user.id,
				phoneNumber: user.phoneNumber,
				ip: request.cf?.hostMetadata,
			};

			await refreshTokenDO.fetch(
				new Request(`${request.url}`, {
					method: "POST",
					body: JSON.stringify(row),
				}),
			);
			// Return the tokens in the response
			return new Response(
				JSON.stringify({
					accessToken,
					refreshToken,
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
		// Construct the request to Twilio for code verification
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