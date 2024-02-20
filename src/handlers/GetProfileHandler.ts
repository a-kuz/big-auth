import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
  Str,
} from "@cloudflare/itty-router-openapi";
import { getUserByToken } from "../services/get-user-by-token";
import { Env } from "../types";

export class GetProfileHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: "Get user profile",
		tags: ["profile"],
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

    security: [{ bearerAuth: [] }, {BearerAuth: []}],
  };

  async handle(request: Request, env: Env, context: any) {
    const authorization = request.headers.get("Authorization");
    const token = authorization?.split(" ")[1];

    if (!token) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
      });
    }

    try {
      const user = await getUserByToken(env.DB, token, env.JWT_SECRET);
      if (!user) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404,
        });
      }
      return new Response(JSON.stringify(user.profile()), { status: 200 });
    } catch (error) {
      console.error(error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch profile" }),
        {
          status: 500,
        },
      );
    }
  }
}
