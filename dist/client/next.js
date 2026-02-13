import { httpActionGeneric } from "convex/server";
// MIME type mapping for Next.js static assets
const MIME_TYPES = {
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".map": "application/json",
    ".txt": "text/plain; charset=utf-8",
};
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
export function registerNextRoutes(http, component, actionRef, { pathPrefix = "/", } = {}) {
    const normalizedPrefix = pathPrefix === "/" ? "" : pathPrefix.replace(/\/$/, "");
    // Hop-by-hop headers that must not be forwarded through proxies
    const hopByHopHeaders = new Set([
        "transfer-encoding",
        "connection",
        "keep-alive",
        "upgrade",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
    ]);
    const handler = httpActionGeneric(async (ctx, request) => {
        const url = new URL(request.url);
        let path = url.pathname;
        // Remove prefix if present
        if (normalizedPrefix && path.startsWith(normalizedPrefix)) {
            path = path.slice(normalizedPrefix.length) || "/";
        }
        // Serve /_next/static/* from Convex storage (fast, V8 runtime)
        if (path.startsWith("/_next/static/")) {
            const asset = await ctx.runQuery(component.lib.getByPath, {
                path,
            });
            if (asset?.storageId) {
                const blob = await ctx.storage.get(asset.storageId);
                if (blob) {
                    return new Response(blob, {
                        status: 200,
                        headers: {
                            "Content-Type": asset.contentType,
                            "Cache-Control": "public, max-age=31536000, immutable",
                            "X-Content-Type-Options": "nosniff",
                        },
                    });
                }
            }
            // Fall through to Node action if not in storage
        }
        // Forward everything else to the Node.js action
        try {
            const method = request.method;
            const headers = [];
            request.headers.forEach((value, key) => {
                headers.push([key, value]);
            });
            const body = !["GET", "HEAD"].includes(method)
                ? await request.arrayBuffer()
                : undefined;
            const result = (await ctx.runAction(actionRef, {
                url: request.url,
                method,
                headers,
                body: body ? body : undefined,
            }));
            // Filter out hop-by-hop headers
            const filteredHeaders = result.headers.filter(([key]) => !hopByHopHeaders.has(key.toLowerCase()));
            return new Response(result.body.byteLength > 0 ? result.body : null, {
                status: result.status,
                headers: filteredHeaders,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Internal Server Error";
            console.error("Next.js handler error:", error);
            return new Response(message, {
                status: 500,
                headers: { "Content-Type": "text/plain" },
            });
        }
    });
    const methods = [
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "PATCH",
        "OPTIONS",
    ];
    for (const method of methods) {
        http.route({
            pathPrefix: pathPrefix === "/" ? "/" : `${normalizedPrefix}/`,
            method,
            handler,
        });
        if (normalizedPrefix) {
            http.route({
                path: normalizedPrefix,
                method,
                handler,
            });
        }
    }
}
/**
 * Get the MIME type for a file path.
 */
export function getNextMimeType(filePath) {
    const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
    return MIME_TYPES[ext] || "application/octet-stream";
}
//# sourceMappingURL=next.js.map