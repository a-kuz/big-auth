import { OpenAPIRouter } from "@cloudflare/itty-router-openapi";
import { SendCodeHandler } from "./handlers/SendCodeHandler";
import { VerifyCodeHandler } from "./handlers/VerifyCodeHandler";
import { GetProfileHandler } from "./handlers/GetProfileHandler";
import { UpdateProfileHandler } from "./handlers/UpdateProfileHandler";
import { UploadFileHandler } from "./handlers/UploadFileHandler";
import { RetrieveFileHandler } from "./handlers/RetrieveFileHandler";

import "reflect-metadata";
import { RefreshTokenHandler } from "./handlers/RefreshTokenHandler";
import { FindContactsHandler } from "./handlers/FindContactsHandler";
export { RefreshTokenDO } from "./durable-objects/refresh-token";
// Initialize the router with the API schema
const router = OpenAPIRouter({
  schema: {
    info: {
      title: "BIG Auth",
      version: "1.0",
    },
  },
});

// Register the Bearer Authentication security scheme
router.registry.registerComponent("securitySchemes", "BearerAuth", {
  type: "http",
  scheme: "bearer",
});

// Register the API endpoints
router.post("/send-code", SendCodeHandler);
router.post("/verify-code", VerifyCodeHandler);
router.get("/profile", GetProfileHandler);
router.post("/profile", UpdateProfileHandler);
router.get("/public/:id/", RetrieveFileHandler);
router.post("/public/upload", UploadFileHandler);

// Register the refresh token endpoint
router.post("/auth/refresh", RefreshTokenHandler);

router.post("/contacts/whoIsThere", FindContactsHandler);

// Redirect root request to the /docs page
router.original.get("/", (request: Request) =>
  Response.redirect(`${request.url}docs`, 302),
);

// 404 for everything else
router.all("*", () => new Response("Not Found.", { status: 404 }));

export default {
  fetch: router.handle,
};
