import {
	OpenAPIRoute,
	OpenAPIRouteSchema,
	Str,
} from "@cloudflare/itty-router-openapi";
import jwt from "@tsndr/cloudflare-worker-jwt";
import { Env } from "../types/Env";
import { errorResponse } from "../utils/error-response";

interface SendMessageRequest {
  receiverId: string;
  message: string;
}

export class SendMessageHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: "Send a message between users",
    tags: ["messages"],
    requestBody: {
      receiverId: new Str(),
      message: new Str(),
    },
    responses: {
      "200": {
        description: "Message sent successfully",
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
    _ctx: any,
    { body }: { body: SendMessageRequest },
  ) {
    const authorization = request.headers.get("Authorization");
    if (!authorization || !authorization.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }
    const token = authorization.substring(7);
    try {
      await jwt.verify(token, env.JWT_SECRET);
    } catch {
      return errorResponse("Unauthorized", 401);
    }
    const decoded = jwt.decode(token);
    const senderId = decoded?.payload?.sub;
    if (!senderId) {
      return errorResponse("Invalid sender", 400);
    }
    try {
      const { receiverId, message } = body;
      const senderDOId = env.USER_MESSAGING_DO.idFromName(senderId);
      const receiverDOId = env.USER_MESSAGING_DO.idFromName(receiverId);
      const senderDO = env.USER_MESSAGING_DO.get(senderDOId);
      const receiverDO = env.USER_MESSAGING_DO.get(receiverDOId);
      const event = JSON.stringify({
        type: "messageSent",
        senderId,
        receiverId,
        message,
        timestamp: Date.now(),
      });
      const headers = new Headers({ "Content-Type": "application/json" });
      await Promise.all([
        senderDO.fetch(new Request(request.url, { method: "POST", body: event, headers })),
        receiverDO.fetch(new Request(request.url, { method: "POST", body: event, headers })),
      ]);
      return new Response(
        JSON.stringify({ success: true, message: "Message sent successfully" }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    } catch (error) {
      console.error("SendMessageHandler Error:", error);
      return errorResponse("Failed to send message", 500);
    }
  }
}
