import { getUserByToken } from "../services/get-user-by-token";
import { errorResponse } from "../utils/error-response";
import { Env } from "../types/Env";
import { OpenAPIRoute, OpenAPIRouteSchema, Path, Str } from "@cloudflare/itty-router-openapi";
import { instanceToPlain } from "class-transformer";

export class GetProfileHandler extends OpenAPIRoute {
	static schema: OpenAPIRouteSchema = {
		summary: "Get user profile",
		operationId: "user profule",
		tags: ["contacts"],
		parameters: { id: Path(Str) },
		responses: {
			"200": {
				description: "Profile fetched successfully",
				schema: {
					id: new Str({ example: "weEEwwecw_wdx2" }),
					phoneNumber: new Str({ example: "+79333333333" }),
					username: new Str({ required: false, example: "@ask_uznetsov" }),
					firstName: new Str({ required: false, example: "Aleksandr" }),
					lastName: new Str({ required: false, example: "Ivanov" }),
					avatarUrl: new Str({
						required: false,
						example: "https://pics.png/png.png",
					}),
				},
			},
		},
		security: [{ BearerAuth: [] }],
	};

	async handle(request: Request, env: Env, context: any, data: { id: string }) {
		const authorization = request.headers.get("Authorization");
		const token = authorization?.split(" ")[1];

		if (!token) {
			return errorResponse("Authorization required", 401);
		}

		try {
			const user = await getUserByToken(env.DB, token, env.JWT_SECRET);
			if (!user) {
				return errorResponse("User not found", 404);
			}

			// Serialize the user object to plain JSON, excluding sensitive fields
			const userProfile = instanceToPlain(user, {
				excludeExtraneousValues: true,
				excludePrefixes: ["_"], // Assuming sensitive or internal fields start with '_'
			});

			return new Response(JSON.stringify(userProfile), {
				status: 200,
				headers: {
					"Content-Type": "application/json",
				},
			});
		} catch (error) {
			console.error(error);
			return errorResponse("Failed to fetch profile", 500);
		}
	}
}
