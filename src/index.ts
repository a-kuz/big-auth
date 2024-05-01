import "reflect-metadata";

import { OpenAPIRouter } from "@cloudflare/itty-router-openapi";

import { SendCodeHandler } from "./handlers/SendCodeHandler";
import { VerifyCodeHandler } from "./handlers/VerifyCodeHandler";

import { RefreshTokenHandler } from "./handlers/RefreshTokenHandler";

import { FindContactsHandler } from "./handlers/FindContactsHandler";
import { GetOwnProfileHandler } from "./handlers/GetOwnProfileHandler";
import { UpdateProfileHandler } from "./handlers/UpdateProfileHandler";

import { RetrieveFileHandler } from "./handlers/RetrieveFileHandler";
import { UploadFileHandler } from "./handlers/UploadFileHandler";

import { SendMessageHandler } from "./handlers/SendMessageHandler";

import { NetworkInfoHandler } from "./handlers/NetworkInfoHandler";
import { GetChatsHandler } from "./handlers/GetChatsHandler";
import { GetProfileHandler } from "./handlers/GetProfileHandler";
import { WebsocketHandler } from "./handlers/WebsocketHandler";
import { CORS } from "./utils/cors";
import { GetMessagesHandler } from "./handlers/GetMessagesHandler";

export { RefreshTokenDO } from "./durable-objects/RefreshTokenDO";
export { UserMessagingDO } from "./durable-objects/messaging";

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

router.get("/profile/:id", GetProfileHandler);

router.get("/profile", GetOwnProfileHandler);
router.post("/profile", UpdateProfileHandler);


router.get("/public/:id/", RetrieveFileHandler);
router.post("/public/upload", UploadFileHandler);

router.post("/contacts/whoIsThere", FindContactsHandler);

router.post("/m/send", SendMessageHandler);
router.get("/m/getMessages", GetMessagesHandler);

router.get("/chats", GetChatsHandler);

router.get("/network", NetworkInfoHandler);

router.get("/websocket*", WebsocketHandler);
router.options('*', CORS) // TODO: add security CORS


// Redirect root request to the /docs page
router.original.get("/", (request: Request) =>
  Response.redirect(`${request.url}docs`, 302),
);

// 404 for everything else
router.all("*", () => new Response("Not Found.", { status: 404 }));

export default {
  fetch: router.handle,
};
