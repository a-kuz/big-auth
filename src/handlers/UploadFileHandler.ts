import {
	OpenAPIRoute,
	OpenAPIRouteSchema,
	Str,
} from "@cloudflare/itty-router-openapi";
import { Env } from "../types/Env";
import { digest } from "../utils/digest";
import { errorResponse } from "../utils/error-response";

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
              "https://dev.big.a-kuznetsov.cc/public/zAE2h2mPSKjWwnxw8qxp4",
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
    ctx: ExecutionContext,
    formData: FormData,
  ): Promise<Response> {

    const file = formData.get("file") as unknown as File;

    if (file) {
      const fileName = file.name;
      const buffer = await file.arrayBuffer();
      const id = await digest(buffer);
      console.log(file.type);
      try {
        ctx.waitUntil(
          env.FILES_KV.put(id, buffer, {
            metadata: { fileName, type: file.type },
          }),
        );


        return new Response(
          JSON.stringify({
            message: "File uploaded successfully",

            url: `${new URL(request.url).origin}/public/${id}`,
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
      return errorResponse("No file uploaded", 400);
    }
  }
}
