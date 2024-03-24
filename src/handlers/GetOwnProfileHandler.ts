import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
  Path,
  Str,
} from "@cloudflare/itty-router-openapi";
import { instanceToPlain } from "class-transformer";
import { getUserById } from "../db/services/get-user";
import { Env } from "../types/Env";
import { errorResponse } from "../utils/error-response";
import { decode, verify } from "@tsndr/cloudflare-worker-jwt";

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
      return errorResponse("Authorization required", 401);
    }
    try {
      // Verify the JWT token
      const isValid = await verify(token, env.JWT_SECRET);
      if (!isValid) {
        return errorResponse("Unauthorized", 401);
      }
    } catch {
      return errorResponse("Unauthorized", 401);
    }
    const decoded = decode(token);
    const userId = decoded?.payload?.sub;
    if (!userId) {
      return errorResponse("Invalid sender", 401);
    }
    const profile = await getUserById(env.DB, userId);

    return new Response(JSON.stringify(instanceToPlain(profile)), {
      status: 200,
    });
  }
}
