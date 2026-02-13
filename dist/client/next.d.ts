import type { FunctionReference, HttpRouter } from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
/**
 * Register HTTP routes for serving a Next.js app via Convex HTTP actions.
 *
 * Static assets (`/_next/static/*`) are served directly from Convex storage
 * (V8 runtime, instant). All other requests are forwarded to a Node.js action
 * that runs NextServer.
 *
 * @param http - The HTTP router to register routes on
 * @param component - The component API reference (for storage lookups)
 * @param actionRef - Reference to the generated `handle` action
 * @param options - Configuration options
 * @param options.pathPrefix - URL prefix (default: "/")
 *
 * @example
 * ```typescript
 * // convex/http.ts
 * import { httpRouter } from "convex/server";
 * import { registerNextRoutes } from "@convex-dev/self-hosting/next";
 * import { components, internal } from "./_generated/api";
 *
 * const http = httpRouter();
 * registerNextRoutes(http, components.selfHosting, internal._generatedNextServer.handle);
 * export default http;
 * ```
 */
export declare function registerNextRoutes(http: HttpRouter, component: ComponentApi, actionRef: FunctionReference<"action", "internal", Record<string, unknown>, unknown>, { pathPrefix, }?: {
    pathPrefix?: string;
}): void;
/**
 * Get the MIME type for a file path.
 */
export declare function getNextMimeType(filePath: string): string;
//# sourceMappingURL=next.d.ts.map