import jwt from "@tsndr/cloudflare-worker-jwt";
import { Env } from "../types/Env";
import { errorResponse } from "../utils/error-response";
import { NewMessageEvent } from "../types/events";
import {
  Num,
  OpenAPIRoute,
  OpenAPIRouteSchema,
  Str,
} from "@cloudflare/itty-router-openapi";

interface SendMessageRequest {
  receiverId: string;
  message: string;
}

export class SendMessageHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    tags: ["messages"],
    summary: "Send a message between users",
    requestBody: {
      recieverId: new Str({ example: "JC0TvKi3f2bIQtBcW1jIn" }),
      message: new Str({ example: "Hello, how are you?" }),
    },
    responses: {
      "200": {
        description: "Message sent successfully",
        schema: {
          messageId: new Num(),
          timestamp: new Num(),
        },
      },
      "400": {
        description: "Bad Request",
      },
      "500": {
        description: "Internal Server Error",
        schema: { message: new Str() },
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
    // Extract the Authorization header from the request
    const authorization = request.headers.get("Authorization");
    if (!authorization || !authorization.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }
    const token = authorization.substring(7);
    try {
      // Verify the JWT token
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
      // Retrieve sender and receiver's durable object IDs
      const senderDOId = env.USER_MESSAGING_DO.idFromName(senderId);
      const receiverDOId = env.USER_MESSAGING_DO.idFromName(receiverId);
      const senderDO = env.USER_MESSAGING_DO.get(senderDOId);
      const receiverDO = env.USER_MESSAGING_DO.get(receiverDOId);
      // Create an event object with message details and timestamp
      const event: NewMessageEvent = {
        type: "newMessage",
        senderId,
        receiverId,
        message,
        timestamp: Date.now(),
      };

      const reqBody = JSON.stringify(event);
      const headers = new Headers({ "Content-Type": "application/json" });

      const storings: Promise<any>[] = [
        senderDO.fetch(
          new Request(request.url, { method: "POST", body: reqBody, headers }),
        ),
      ];
      if (receiverId != "0" && receiverId !== senderId) {
        storings.push(
          receiverDO.fetch(
            new Request(request.url, {
              method: "POST",
              body: reqBody,
              headers,
            }),
          ),
        );
      }

      const [responseSender, responseReceiver] = await Promise.all(storings);
      // Return a success response
      return responseSender;
    } catch (error) {
      console.error("SendMessageHandler Error:", error);
      return errorResponse("Failed to send message", 500);
    }
  }
}
