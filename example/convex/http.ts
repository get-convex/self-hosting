import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/self-hosting";
import { components } from "./_generated/api";

const http = httpRouter();

// Register static file serving routes.
// This will serve your built static files from Convex storage.
//
// By default, it serves files at the root path "/" with SPA fallback enabled.
// This means:
// - /index.html -> serves index.html
// - /assets/main.js -> serves the JS file
// - /about -> serves index.html (SPA fallback for routes without file extension)
registerStaticRoutes(http, components.selfHosting);

// You can also serve at a specific path prefix:
// registerStaticRoutes(http, components.selfHosting, {
//   pathPrefix: "/app",
//   spaFallback: true,
// });

// You can disable SPA fallback for API-only static file serving:
// registerStaticRoutes(http, components.selfHosting, {
//   pathPrefix: "/static",
//   spaFallback: false,
// });

export default http;
