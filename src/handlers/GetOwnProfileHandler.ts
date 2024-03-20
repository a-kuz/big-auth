import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
  Path,
  Str,
} from "@cloudflare/itty-router-openapi";
import { instanceToPlain } from "class-transformer";
import { getUserById } from "../db/services/get-user";
import { Env } from "../types/Env";

export class GetOwnProfileHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: "Get user profile",
    tags: ["profile"],
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
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
      });
    }

    try {
      const profile = await getUserById(env.DB, data.id);

      return new Response(JSON.stringify(instanceToPlain(profile, {})), {
        status: 200,
      });
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
