import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
  Path,
  Str,
} from "@cloudflare/itty-router-openapi";
import { Env } from "../types/Env";
import { errorResponse } from "../utils/error-response";

export class RetrieveFileHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: "retrieve a file by id",
    tags: ["files"],
    parameters: { id: Path(Str) },

    responses: {
      "200": {
        description: "File retrieved successfully",
        schema: new Str({ format: "binary" }),
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
    let { id } = data.params;
    try {
      const fileResponse = await env.FILES_KV.getWithMetadata<{
        fileName: string;
        type: string;
      }>(id, "arrayBuffer");

      if (!fileResponse) {
        return errorResponse("File not found", 404);
      }

      // const fileName = fileResponse.customMetadata?.fileName ?? "response";
      const fileName = "file.jpeg";

      // Assuming the file's content type and other metadata are correctly set in R2
      const headers = new Headers();
      const { readable, writable } = new TransformStream();
      // const reader = readable.getReader({ mode: 'byob' });

      return new Response(fileResponse.value, {
        encodeBody: "manual",
        headers: {
          id,
          "file-name": fileResponse.metadata!.fileName,
          "Content-Type": fileResponse.metadata!.type,
          Etag: id,
        },
      });
    } catch (error) {
      console.error("Error retrieving file:", error);
      return errorResponse("Failed to retrieve file");
    }
  }
}
