import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
  Str,
  Arr,
} from "@cloudflare/itty-router-openapi";
import { getUserByPhoneNumbers } from "../services/get-user";
import { Env } from "../types";
import { errorResponse } from "../utils/error-response";

export class FindContactsHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: "Find contacts by phone numbers",
    tags: ["contacts"],
    requestBody: {
      phoneNumbers: new Arr(new Str({ example: "+79333333333" })),
    },
    responses: {
      "200": {
        description: "Contacts found",
        schema: {
          contacts: new Arr({
            id: new Str(),
            phoneNumber: new Str(),
            username: new Str({ required: false }),
            firstName: new Str({ required: false }),
            lastName: new Str({ required: false }),
            avatarUrl: new Str({ required: false }),
          }),
        },
      },
      "400": {
        description: "Bad Request",
      },
      "500": {
        description: "Server Error",
      },
    },
  };

  async handle(request: Request, env: Env, _context: any, data: {body: { phoneNumbers: string[] }} ) {
    try {

      const contacts = await getUserByPhoneNumbers(env.DB, data.body.phoneNumbers);
      return new Response(JSON.stringify({ contacts }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch (error) {
      console.error(error);
      return errorResponse("Failed to find contacts");
    }
  }
}
