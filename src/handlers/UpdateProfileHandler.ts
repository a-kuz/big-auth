import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
  Str,
} from "@cloudflare/itty-router-openapi";
import { getUserByToken } from "../services/get-user-by-token";
import { updateUser } from "../services/update-user";
import { Env } from "../types";
import { errorResponse } from "../utils/error-response";

export class UpdateProfileHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: "Update user profile",
    tags: ["profile"],
    requestBody: {
      username: new Str({ required: false }),
      firstName: new Str({ required: false }),
      lastName: new Str({ required: false }),
      avatarUrl: new Str({ required: false }),
    },
    responses: {
      "200": {
        description: "Profile updated successfully",
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
    security: [{ BearerAuth: [] }],
  };

  async handle(
    request: Request,
    env: Env,
    context: any,
    data: Record<string, any>,
  ) {
    const authorization = request.headers.get("Authorization");
    const token = authorization?.split(" ")[1];
    if (!token) {
      return errorResponse("Authorization required", 401);
    }

    try {
      const user = await getUserByToken(env.DB, token, env.JWT_SECRET);
      const {
        username = undefined,
        firstName = undefined,
        lastName = undefined,
        avatarUrl = undefined,
      } = data.body;

      if (
        (firstName === "" && !lastName && !user.firstName && !user.lastName) ||
        (lastName === "" && !firstName && !user.firstName && !user.lastName) ||
        (!user.firstName && !user.lastName && !lastName && !firstName)
      ) {
        return errorResponse("Please, define firstName or lastName");
      }
      await updateUser(env.DB, user.id, {
        username,
        firstName,
        lastName,
        avatarUrl,
      });

      return new Response(
        JSON.stringify({ message: "Profile updated successfully" }),
        { status: 200 },
      );
    } catch (error) {
      console.error(error);
      return errorResponse("Failed to update profile");
    }
  }
}
