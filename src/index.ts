import "reflect-metadata";

import { OpenAPIRouter } from "@cloudflare/itty-router-openapi";

import { SendCodeHandler } from "./handlers/SendCodeHandler";
import { VerifyCodeHandler } from "./handlers/VerifyCodeHandler";

import { RefreshTokenHandler } from "./handlers/RefreshTokenHandler";

import { GetProfileHandler } from "./handlers/GetProfileHandler";
import { UpdateProfileHandler } from "./handlers/UpdateProfileHandler";
import { FindContactsHandler } from "./handlers/FindContactsHandler";

import { UploadFileHandler } from "./handlers/UploadFileHandler";
import { RetrieveFileHandler } from "./handlers/RetrieveFileHandler";

import { SendMessageHandler } from "./handlers/SendMessageHandler";

import { NetworkInfoHandler } from "./handlers/NetworkInfoHandler";
import { TEST_NUMBERS } from "./constants";

export { RefreshTokenDO } from "./durable-objects/refresh-token";
export { UserMessagingDO } from "./durable-objects/user-messaging";

const router = OpenAPIRouter({
  schema: {
    servers: [
      {
        url: "https://dev.big.a-kuznetsov.cc",
        description: "develop",
        variables: {
          TEST_NUMBERS: { default: JSON.stringify(TEST_NUMBERS, null, 2) },
        },
      },
    ],
    info: {
      title: "BIG Auth",
      version: "1.0",
    },
  },
});

router.registry.registerComponent("securitySchemes", "BearerAuth", {
  type: "http",
  scheme: "bearer",
});

router.post("/send-code", SendCodeHandler);
router.post("/verify-code", VerifyCodeHandler);
router.post("/auth/refresh", RefreshTokenHandler);

router.get("/profile", GetProfileHandler);
router.post("/profile", UpdateProfileHandler);

router.get("/public/:id/", RetrieveFileHandler);
router.post("/public/upload", UploadFileHandler);

router.post("/contacts/whoIsThere", FindContactsHandler);

router.post("/m/send", SendMessageHandler);

router.get("/network", NetworkInfoHandler);

// Redirect root request to the /docs page
router.original.get("/", (request: Request) =>
  Response.redirect(`${request.url}docs`, 302),
);

// 404 for everything else
router.all("*", () => new Response("Not Found.", { status: 404 }));

export default {
  fetch: router.handle,
};
