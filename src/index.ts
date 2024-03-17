import "reflect-metadata";

import { OpenAPIRouter } from "@cloudflare/itty-router-openapi";

import { SendCodeHandler } from "./handlers/SendCodeHandler";
import { VerifyCodeHandler } from "./handlers/VerifyCodeHandler";

import { RefreshTokenHandler } from "./handlers/RefreshTokenHandler";

import { FindContactsHandler } from "./handlers/FindContactsHandler";
import { GetProfileHandler } from "./handlers/GetProfileHandler";
import { UpdateProfileHandler } from "./handlers/UpdateProfileHandler";

import { RetrieveFileHandler } from "./handlers/RetrieveFileHandler";
import { UploadFileHandler } from "./handlers/UploadFileHandler";

import { SendMessageHandler } from "./handlers/SendMessageHandler";

import { NetworkInfoHandler } from "./handlers/NetworkInfoHandler";

export { RefreshTokenDO } from "./durable-objects/refresh-token";
export { UserMessagingDO } from "./durable-objects/user-messaging";

const router = OpenAPIRouter({
  schema: {

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
router.all("*", () => new Response("Not Fou§nd.", { status: 404 }));

export default {
  fetch: router.handle,
};
