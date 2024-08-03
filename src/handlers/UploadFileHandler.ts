import { jsonResp, OpenAPIRouteSchema, Str } from '@cloudflare/itty-router-openapi'
import { errorResponses } from '~/types/openapi-schemas/error-responses'
import { Route } from '~/utils/route'
import { Env } from '../types/Env'
import { digest } from '../utils/digest'
import { errorResponse } from '../utils/error-response'

export class UploadFileHandler extends Route {
  //@ts-ignore
  async validateRequest(request: Request<unknown, CfProperties<unknown>>): Promise<{ data: FormData }> {
    return { data: await request.formData() }
  }



  static schema: OpenAPIRouteSchema = {
    summary: 'Upload a file',
    tags: ['files'],
    responses: {
      '200': {
        description: 'File uploaded successfully',

        schema: {
          url: new Str({
            example: 'https://dev.iambig.ai/public/zAE2h2mPSKjWwnxw8qxp4',
          }),
        },
      },

      ...errorResponses,
    },
  }
  async handle(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
    formData: FormData,
  ): Promise<Response> {
    const file = formData.get('file') as unknown as File

    if (file) {
      const fileName = file.name
      const buffer = await file.arrayBuffer()
      const id = await digest(buffer)

      try {
        ctx.waitUntil(
          env.FILES_KV.put(id, buffer, {
            metadata: { fileName, type: file.type },
          }),
        )

        return jsonResp({
          url: `${new URL(request.url).origin}/public/${id}`,
        })
      } catch (error) {
        console.error('Error uploading file:', error)
        return errorResponse('Failed to upload file')
      }
    } else {
      return errorResponse('No file uploaded', 400)
    }
  }
}
