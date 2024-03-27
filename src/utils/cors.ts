import { OpenAPIRoute } from '@cloudflare/itty-router-openapi'

export class CORS extends OpenAPIRoute {
  // OpenAPI
  static schema = {}

  private corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Max-Age': '86400',
  }

  async handle(req: Request, _env: {}, _ctx: any, _data: Record<string, any>) {
    if (
      req.headers.get('Origin') !== null &&
      req.headers.get('Access-Control-Request-Method') !== null &&
      req.headers.get('Access-Control-Request-Headers') !== null
    ) {
      // Handle CORS preflight requests
      return new Response(null, {
        headers: {
          ...this.corsHeaders,
          'Access-Control-Allow-Headers': req.headers.get('Access-Control-Request-Headers') || '*',
        },
      })
    } else {
      // Handle standard OPTIONS request
      return new Response(null, {
        headers: {
          Allow: 'GET, HEAD, POST, OPTIONS',
        },
      })
    }
  }
}
