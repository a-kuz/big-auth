import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
  Path,
  Str,
} from "@cloudflare/itty-router-openapi";
import { Env } from "../types/Env";
import { errorResponse } from "../utils/error-response";

// RetrieveFileHandler class is designed to handle file retrieval requests.
export class RetrieveFileHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: "retrieve a file by id",
    tags: ["files"],
    parameters: { id: Path(Str) },

    responses: {
      "200": {
        description: "File retrieved successfully",
        schema: new Str({ format: "binary" }),
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

  // The handle method processes the file retrieval request.
  async handle(
    _request: Request,
    env: Env,
    _ctx: any,
    data: { params: { id: string } },
  ): Promise<Response> {
    let { id } = data.params;
    try {
      // Attempt to retrieve the file and its metadata from Cloudflare KV storage.
      const fileResponse = await env.FILES_KV.getWithMetadata<{
        fileName: string;
        type: string;
      }>(id, "arrayBuffer");

      // If the file is not found, return a 404 error response.
      if (!fileResponse) {
        return errorResponse("File not found", 404);
      }

      // If the file is found, return the file content and relevant headers.
      return new Response(fileResponse.value, {

        headers: {
          id,
          "file-name": fileResponse.metadata!.fileName,
          "Content-Type": fileResponse.metadata!.type,
          Etag: id,
        },
      });
    } catch (error) {
      // Log any errors encountered during the file retrieval process.
      console.error("Error retrieving file:", error);
      // Return a 500 error response if an exception occurs.
      return errorResponse("Failed to retrieve file");
    }
  }
}
