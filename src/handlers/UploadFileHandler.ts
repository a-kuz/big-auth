import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
  Str,
} from "@cloudflare/itty-router-openapi";
import { Env } from "../types";
import { errorResponse } from "../utils/error-response";
import { newId } from "../utils/new-id";

export class UploadFileHandler extends OpenAPIRoute {
  //@ts-ignore
  async validateRequest(request: Request<unknown, CfProperties<unknown>>) {
    return { data: await request.formData() };
  }
  static schema: OpenAPIRouteSchema = {
    summary: "Upload a file to R2",
    tags: ["files"],
    requestBody: new Str({ format: "formData" }),
    responses: {
      "200": {
        description: "File uploaded successfully",

        schema: {
          url: new Str({
            example:
              "http://dev.big.a-kuznetsov.cc/public/zAE2h2mPSKjWwnxw8qxp4",
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
  async handle(
    request: Request,
    env: Env,
    ctx: any,
    formData: FormData,
  ): Promise<Response> {
    // const formData = await request.formData();
    const file = formData.get("file") as unknown as File;
    let uploadResult: R2Object;
    if (file) {
      const fileName = file.name;

      const id = newId();
      try {
        uploadResult = await env.USER_FILES.put(id, file.stream(), {
          customMetadata: { fileName },
        });

        return new Response(
          JSON.stringify({
            message: "File uploaded successfully",

            url: `${new URL(request.url).origin}/public/${id}`,
            etag: uploadResult.etag,
            uploadResult,
          }),
          {
            status: 200,
          },
        );
      } catch (error) {
        console.error("Error uploading file:", error);
        return errorResponse("Failed to upload file");
      }
    } else {
      return new Response(JSON.stringify({ error: "No file uploaded" }), {
        status: 400,
      });
    }
  }
}
