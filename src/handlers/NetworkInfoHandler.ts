import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
} from "@cloudflare/itty-router-openapi";
import { Env } from "../types/Env";

export class NetworkInfoHandler extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: "Network info",
    tags: ["debug"],
    responses: {
      "200": {
        description: "network info",
        schema: {},
      },
    },

    security: [],
  };

  async handle(request: Request, env: Env, context: any) {
    const {
      country = "world",
      colo,
      region = "NO_REGION",
      httpProtocol,
      city = "NO_CITY",
    } = request.cf as CfProperties;
    const humanizedInfo = `Your request from ${country} -> ${region} -> ${city} was processed by ${colo} cloudflare data center.


${httpProtocol} protocol was used.

More info about datacenter '${colo}' location: https://en.wikipedia.org/wiki/IATA_airport_code
		`;
    const headers = request.headers;
    const acceptHeader = headers.get("accept");
    const cloudlflareRequestInfo = request.cf;

    if (acceptHeader === "application/json") {
      const response = JSON.stringify(
        {
          humanizedInfo,
          headers: { accept: acceptHeader, ...request.headers },
          cloudlflareRequestInfo,
        },
        undefined,
        2,
      );
      {
      }
      return new Response(response);
    } else {
      return new Response(
        html(
          country as string,
          region as string,
          city as string,
          httpProtocol as string,
          colo as string,
          cloudlflareRequestInfo,
        ),
        { headers: { "content-type": "html" } },
      );
    }
  }
}

const html = (
  country: string,
  region: string,
  city: string,
  httpProtocol: string,
  colo: string,
  cloudlflareRequestInfo: Record<string, string>,
) => {
  return `<!DOCTYPE html>
	<html lang="en">
	<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Request Information</title>
			<style>
					* {
							margin: 0;
							padding: 0;
							box-sizing: border-box;
					}
					body {
							font-family: 'Helvetica Neue', Arial, sans-serif;
							background-color: #fff;
							color: #333;
							padding: 40px 20px;
							display: flex;
							justify-content: center;
							align-items: center;
							height: 100vh;
							margin: -20px;
					}
					.container {
							padding: 20px;
							border: 2px solid #000;
							display: inline-block;
					}
					.header {
							font-size: 18px;
							margin-bottom: 15px;
					}
					.content, .cloudflare-info {
							font-size: 14px;
							line-height: 1.5;
							margin-bottom: 20px;
					}
					.link {
							color: #000;
							text-decoration: underline;
					}
					strong {
							font-weight: normal;
							border-bottom: 1px dotted #333;
					}
					.info-title {
							font-weight: bold;
							margin-top: 10px;
					}
			</style>
	</head>
	<body>
			<div class="container">
					<div class="header">Request Information</div>
					<div class="content">
							Your request from <strong>${cloudlflareRequestInfo.country} -> ${cloudlflareRequestInfo.region} -> ${cloudlflareRequestInfo.city}</strong> was processed by <strong>${cloudlflareRequestInfo.colo}</strong> Cloudflare data center.<br><br>
							<strong>${cloudlflareRequestInfo.httpProtocol}</strong> was used.<br><br>
							More info about datacenter '<strong>${cloudlflareRequestInfo.colo}</strong>' location: <a href="https://en.wikipedia.org/wiki/IATA_airport_code" class="link" target="_blank">IATA airport code</a>
					</div>
					<div class="cloudflare-info">
							<div class="info-title">Cloudflare Request Info:</div>
							Client TCP RTT: <strong>${cloudlflareRequestInfo.clientTcpRtt}ms</strong><br>
							Longitude: <strong>${cloudlflareRequestInfo.longitude}</strong><br>
							Continent: <strong>${cloudlflareRequestInfo.continent}</strong><br>
							ASN: <strong>${cloudlflareRequestInfo.asn}</strong><br>
							Client Accept Encoding: <strong>${cloudlflareRequestInfo.clientAcceptEncoding}</strong><br>
							Is EU Country: <strong>${cloudlflareRequestInfo.isEUCountry}</strong><br>
							City: <strong>${cloudlflareRequestInfo.city}</strong><br>
							Timezone: <strong>${cloudlflareRequestInfo.timezone}</strong><br>
							Region: <strong>${cloudlflareRequestInfo.region} (${cloudlflareRequestInfo.regionCode})</strong><br>
							Latitude: <strong>${cloudlflareRequestInfo.latitude}</strong><br>
							Postal Code: <strong>${cloudlflareRequestInfo.postalCode}</strong><br>
							AS Organization: <strong>${cloudlflareRequestInfo.asOrganization}</strong><br>
							Country: <strong>${cloudlflareRequestInfo.country}</strong><br>
							Edge Request Keep Alive Status: <strong>${cloudlflareRequestInfo.edgeRequestKeepAliveStatus}</strong><br>
					</div>
			</div>
	</body>
	</html>
	`;
};
