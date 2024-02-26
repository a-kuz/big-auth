import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
  Path,
  Str,
} from "@cloudflare/itty-router-openapi";
import { Env } from "../types";
import { errorResponse } from "../utils/error-response";

export class RetrieveFileHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: "retrieve a file by id",
    tags: ["files"],
    parameters: { id: Path(Str) },

    responses: {
      "200": {
        description: "File retrieved successfully",
        // Here, adapt this part if you need to specify the content type or structure
      },
      "400": {
        description: "Bad Request",
        schema: {
          error: new Str({ example: "id is required" }),
        },
      },
      "404": {
        description: "File not found",
        schema: {
          error: new Str({ example: "File not found" }),
        },
      },
      "500": {
        description: "Server Error",
        schema: {
          error: new Str({ example: "Failed to retrieve file" }),
        },
      },
    },
  };

  async handle(
    _request: Request,
    env: Env,
    _ctx: any,
    data: { params: { id: string } },
  ): Promise<Response> {
    console.log(data);
    let { id } = data.params;
    try {
      const fileResponse = await env.USER_FILES.get(id);
      if (!fileResponse) {
        return errorResponse("File not found", 404);
      }

      if (!fileResponse.httpMetadata) {
        return errorResponse("File metadata not found", 500);
      }
      const fileName = fileResponse.customMetadata?.fileName ?? "response";

      // Assuming the file's content type and other metadata are correctly set in R2
      const headers = new Headers();
      fileResponse.writeHttpMetadata(headers);

      return new Response(fileResponse.body, {
        headers: {
          id,
          etag: fileResponse.etag,
          "file-name": fileName,
          ...headers,
        },
      });
    } catch (error) {
      console.error("Error retrieving file:", error);
      return errorResponse("Failed to retrieve file");
    }
  }
}
