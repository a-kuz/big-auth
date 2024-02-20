import { OpenAPIRouter } from "@cloudflare/itty-router-openapi";
import { SendCodeHandler } from "./handlers/SendCodeHandler";
import { VerifyCodeHandler } from "./handlers/VerifyCodeHandler";
import { GetProfileHandler } from "./handlers/GetProfileHandler";

const router = OpenAPIRouter({
  schema: {
    info: {
      title: "BIG Auth",
      version: "1.0",
    },
  },
});
router.registry.registerComponent(
  'securitySchemes',
  'BearerAuth',
  {
    type: 'http',
    scheme: 'bearer',
  },
)

router.post("/send-code", SendCodeHandler);
router.post("/verify-code", VerifyCodeHandler);
router.get("/profile", GetProfileHandler);

// Redirect root request to the /docs page
router.original.get("/", (request: Request) =>
  Response.redirect(`${request.url}docs`, 302),
);

// 404 for everything else
router.all("*", () => new Response("Not Found.", { status: 404 }));

export default {
  fetch: router.handle,
};
