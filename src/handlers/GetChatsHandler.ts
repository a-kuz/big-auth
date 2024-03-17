import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
  Arr,
  Obj,
  Str,
  Enumeration,
  Bool,
  DateTime,
  Num,
} from "@cloudflare/itty-router-openapi";
import { getUserByToken } from "../services/get-user-by-token";
import { Env } from "../types/Env";
import { errorResponse } from "../utils/error-response";

export class GetChatsHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: "Retrieve chat messages",
    tags: ["chats"],
    responses: {
      "200": {
        description: "Chat messages retrieved successfully",
        schema: {
          chats: new Arr(
            new Obj({
              type: new Enumeration({
                values: ["dialog", "group", "channel"],
                example: "dialog",
              }),
              id: new Str({ example: "JC0TvKi3f2bIQtBcW1jIn" }),
              photoUrl: new Str({
                required: false,
                example:
                  "https://dev.big.a-kuznetsov.cc/public/gb24ixCWLL25S-jtzYck7",
              }),
              name: new Str({ example: "Серёжа" }),
              lastMessageText: new Str({ example: "Hi" }),
              lastMessageTime: new DateTime(),
              lastMessageAuthor: new Str({
                required: false,
                example: "Серёжа",
              }),
              lastMessageStatus: new Enumeration({
                values: ["read", "unread"],
              }),
              missedMessagesCount: new Num({ example: 1 }),
              verified: new Bool(),
            }),
          ),
        },
      },
      "401": {
        description: "Unauthorized",
      },
      "500": {
        description: "Internal Server Error",
      },
    },
    security: [{ BearerAuth: [] }],
  };

  async handle(request: Request, env: Env): Promise<Response> {
    let user;
    try {
      try {
        // Authenticate the user
        user = await getUserByToken(
          env.DB,
          request.headers.get("Authorization")!.split(" ")[1],
          env.JWT_SECRET,
        );
      } catch (error) {}
      if (!user) {
        return errorResponse("Unauthorized", 401);
      }

      const userMessagingDOId = env.USER_MESSAGING_DO.idFromName(user.id);
      const userMessagingDO = env.USER_MESSAGING_DO.get(userMessagingDOId);

      const params = new URLSearchParams({
        userId: user.id,
        username: user.username ?? `${user.lastName} ${user.firstName}`,
      });

      const url = new URL(request.url);

      return userMessagingDO.fetch(
        new Request(`${url.origin}/chats?${params.toString()}`, {
          method: "GET",
        }),
      );
    } catch (error) {
      // Handle any errors
      console.error("Failed to retrieve chats:", error);

      return errorResponse(JSON.stringify(error.message), 500);
    }
  }
}
