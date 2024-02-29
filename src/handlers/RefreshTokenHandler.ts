import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
  Str,
} from "@cloudflare/itty-router-openapi";
import { getUserById } from "../services/get-user";
import { Env } from "../types";
import { errorResponse } from "../utils/error-response";

export class RefreshTokenHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: "Refresh tokens",
    tags: ["auth"],
    requestBody: {
      refreshToken: new Str()
    },
    responses: {
      "200": {
        description: "ok",
        schema: {
          accessToken: new Str(),
          refreshToken: new Str(),
        },
      },
      "400": {
        description: "Bad Request",
      },
      "401": {
        description: "Unauthorized",
      },
      "500": {
        description: "Server Error",
      },
    },
    security: [],
  };

  async handle(
    request: Request,
    env: Env,
    context: any,
    data: Record<string, any>,
  ) {
    try {
      const { refreshToken} = data.body;
			const userId = refreshToken.split('.')[1]
      const user = await getUserById(env.DB, userId);

      const params = new URLSearchParams({
        userId: user.id,
        phoneNumber: user.phoneNumber,
        refreshToken,
      });

      const id = env.REFRESH_TOKEN_DO.idFromName(userId);
      const obj = env.REFRESH_TOKEN_DO.get(id);

      const url = new URL(request.url);

      return obj.fetch(
        new Request(`${url.origin}/refresh?${params.toString()}`, {
          method: "POST",
        }),
      );
    } catch (error) {
      console.error(error);
      return errorResponse("Something went worng");
    }
  }
}
