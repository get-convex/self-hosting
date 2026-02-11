import { httpActionGeneric, internalActionGeneric, internalMutationGeneric, internalQueryGeneric, queryGeneric, } from "convex/server";
import { v } from "convex/values";
// MIME type mapping for common file types
const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
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
    ".txt": "text/plain; charset=utf-8",
    ".map": "application/json",
    ".webmanifest": "application/manifest+json",
    ".xml": "application/xml",
};
/**
 * Generate HTML page shown when no assets have been deployed yet.
 */
function getSetupHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Convex Self Hosting</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 640px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #fafafa;
      color: #333;
      line-height: 1.6;
    }
    h1 { color: #111; margin-bottom: 8px; }
    .subtitle { color: #666; margin-bottom: 32px; }
    code {
      background: #e8e8e8;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 14px;
    }
    pre {
      background: #1a1a1a;
      color: #f0f0f0;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 14px;
    }
    .step { margin-bottom: 24px; }
    .step-num {
      display: inline-block;
      background: #333;
      color: white;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      text-align: center;
      font-size: 14px;
      line-height: 24px;
      margin-right: 8px;
    }
    a { color: #0070f3; }
  </style>
</head>
<body>
  <h1>Almost there!</h1>
  <p class="subtitle">Your Convex backend is running, but no static files have been deployed yet.</p>

  <div class="step">
    <span class="step-num">1</span>
    <strong>Build your frontend</strong>
    <pre>npm run build</pre>
  </div>

  <div class="step">
    <span class="step-num">2</span>
    <strong>Deploy your static files</strong>
    <pre>npx @convex-dev/self-hosting deploy</pre>
  </div>

  <p>Or deploy everything in one command:</p>
  <pre>npm run deploy</pre>

  <p style="margin-top: 32px; color: #666; font-size: 14px;">
    Learn more at <a href="https://github.com/get-convex/self-hosting">github.com/get-convex/self-hosting</a>
  </p>
</body>
</html>`;
}
/**
 * Get MIME type for a file path based on its extension.
 */
export function getMimeType(path) {
    const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
    return MIME_TYPES[ext] || "application/octet-stream";
}
/**
 * Check if a path has a file extension.
 */
function hasFileExtension(path) {
    const lastSegment = path.split("/").pop() || "";
    return lastSegment.includes(".") && !lastSegment.startsWith(".");
}
/**
 * Check if asset is a hashed asset (for cache control).
 * Vite produces: index-lj_vq_aF.js, style-B71cUw87.css
 */
function isHashedAsset(path) {
    return /[-.][\dA-Za-z_]{6,12}\.[a-z]+$/.test(path);
}
/**
 * Register HTTP routes for serving static files.
 * This creates a catch-all route that serves files from Convex storage
 * with SPA fallback support.
 *
 * @param http - The HTTP router to register routes on
 * @param component - The component API reference
 * @param options - Configuration options
 * @param options.pathPrefix - URL prefix for static files (default: "/")
 * @param options.spaFallback - Enable SPA fallback to index.html (default: true)
 *
 * @example
 * ```typescript
 * // In your convex/http.ts
 * import { httpRouter } from "convex/server";
 * import { registerStaticRoutes } from "@convex-dev/self-hosting";
 * import { components } from "./_generated/api";
 *
 * const http = httpRouter();
 *
 * // Serve static files at root
 * registerStaticRoutes(http, components.selfHosting);
 *
 * // Or serve at a specific path prefix
 * registerStaticRoutes(http, components.selfHosting, {
 *   pathPrefix: "/app",
 * });
 *
 * export default http;
 * ```
 */
/**
 * Check if a content type is HTML.
 */
function isHtmlContentType(contentType) {
    return contentType.startsWith("text/html");
}
export function registerStaticRoutes(http, component, { pathPrefix = "/", spaFallback = true, cdnBaseUrl, } = {}) {
    // Normalize pathPrefix - ensure it starts with / and doesn't end with /
    const normalizedPrefix = pathPrefix === "/" ? "" : pathPrefix.replace(/\/$/, "");
    const serveStaticFile = httpActionGeneric(async (ctx, request) => {
        const url = new URL(request.url);
        let path = url.pathname;
        // Remove prefix if present
        if (normalizedPrefix && path.startsWith(normalizedPrefix)) {
            path = path.slice(normalizedPrefix.length) || "/";
        }
        // Normalize: serve index.html for root
        if (path === "" || path === "/") {
            path = "/index.html";
        }
        let asset = await ctx.runQuery(component.lib.getByPath, { path });
        // SPA fallback: if not found and no file extension, serve index.html
        if (!asset && spaFallback && !hasFileExtension(path)) {
            asset = await ctx.runQuery(component.lib.getByPath, {
                path: "/index.html",
            });
        }
        // 404 if still not found
        if (!asset) {
            // If looking for index.html and it's not there, show setup instructions
            if (path === "/index.html") {
                return new Response(getSetupHtml(), {
                    status: 200,
                    headers: { "Content-Type": "text/html; charset=utf-8" },
                });
            }
            return new Response("Not Found", {
                status: 404,
                headers: { "Content-Type": "text/plain" },
            });
        }
        // CDN redirect: if asset has blobId, is not HTML, and cdnBaseUrl is configured
        if (asset.blobId && cdnBaseUrl && !isHtmlContentType(asset.contentType)) {
            const baseUrl = typeof cdnBaseUrl === "function" ? cdnBaseUrl(request) : cdnBaseUrl;
            const redirectUrl = `${baseUrl.replace(/\/$/, "")}/${asset.blobId}`;
            // Cache control for redirect: hashed assets can cache the redirect itself
            const cacheControl = isHashedAsset(path)
                ? "public, max-age=31536000, immutable"
                : "public, max-age=0, must-revalidate";
            return new Response(null, {
                status: 302,
                headers: {
                    Location: redirectUrl,
                    "Cache-Control": cacheControl,
                },
            });
        }
        // Serve from Convex storage
        if (!asset.storageId) {
            return new Response("Asset not available", {
                status: 500,
                headers: { "Content-Type": "text/plain" },
            });
        }
        // Use storageId as ETag (unique per file content)
        const etag = `"${asset.storageId}"`;
        // Check for conditional request (If-None-Match)
        const ifNoneMatch = request.headers.get("If-None-Match");
        if (ifNoneMatch === etag) {
            // Client has current version - return 304 Not Modified
            return new Response(null, {
                status: 304,
                headers: {
                    ETag: etag,
                    "Cache-Control": isHashedAsset(path)
                        ? "public, max-age=31536000, immutable"
                        : "public, max-age=0, must-revalidate",
                },
            });
        }
        // Get file from storage
        const blob = await ctx.storage.get(asset.storageId);
        if (!blob) {
            return new Response("Storage error", {
                status: 500,
                headers: { "Content-Type": "text/plain" },
            });
        }
        // Cache control: hashed assets can be cached forever
        const cacheControl = isHashedAsset(path)
            ? "public, max-age=31536000, immutable"
            : "public, max-age=0, must-revalidate";
        return new Response(blob, {
            status: 200,
            headers: {
                "Content-Type": asset.contentType,
                "Cache-Control": cacheControl,
                ETag: etag,
                "X-Content-Type-Options": "nosniff",
            },
        });
    });
    // Use pathPrefix routing
    http.route({
        pathPrefix: pathPrefix === "/" ? "/" : `${normalizedPrefix}/`,
        method: "GET",
        handler: serveStaticFile,
    });
    // Also handle exact prefix without trailing slash
    if (normalizedPrefix) {
        http.route({
            path: normalizedPrefix,
            method: "GET",
            handler: serveStaticFile,
        });
    }
}
/**
 * Expose the upload API as INTERNAL functions for secure deployments.
 * These functions can only be called via `npx convex run` or from other Convex functions.
 *
 * @param component - The component API reference
 *
 * @example
 * ```typescript
 * // In your convex/staticHosting.ts
 * import { exposeUploadApi } from "@convex-dev/self-hosting";
 * import { components } from "./_generated/api";
 *
 * export const { generateUploadUrl, recordAsset, gcOldAssets, listAssets } =
 *   exposeUploadApi(components.selfHosting);
 * ```
 *
 * Then deploy using:
 * ```bash
 * npm run deploy:static
 * ```
 */
export function exposeUploadApi(component) {
    return {
        /**
         * Generate a signed URL for uploading a file.
         * Files are stored in the app's storage (not the component's).
         */
        generateUploadUrl: internalMutationGeneric({
            args: {},
            handler: async (ctx) => {
                return await ctx.storage.generateUploadUrl();
            },
        }),
        /**
         * Record an uploaded asset in the database.
         * Automatically cleans up old storage files when replacing.
         * Pass storageId for Convex storage assets, or blobId for CDN assets.
         */
        recordAsset: internalMutationGeneric({
            args: {
                path: v.string(),
                storageId: v.optional(v.string()),
                blobId: v.optional(v.string()),
                contentType: v.string(),
                deploymentId: v.string(),
            },
            handler: async (ctx, args) => {
                const { oldStorageId, oldBlobId } = await ctx.runMutation(component.lib.recordAsset, {
                    path: args.path,
                    ...(args.storageId ? { storageId: args.storageId } : {}),
                    ...(args.blobId ? { blobId: args.blobId } : {}),
                    contentType: args.contentType,
                    deploymentId: args.deploymentId,
                });
                if (oldStorageId) {
                    try {
                        await ctx.storage.delete(oldStorageId);
                    }
                    catch {
                        // Ignore - old file may have been in different storage
                    }
                }
                // Return oldBlobId so caller can clean up CDN blobs if needed
                return oldBlobId ?? null;
            },
        }),
        /**
         * Garbage collect old assets and notify clients of the new deployment.
         * Returns the count of deleted assets.
         * Also triggers connected clients to reload via the deployment subscription.
         */
        gcOldAssets: internalMutationGeneric({
            args: {
                currentDeploymentId: v.string(),
            },
            handler: async (ctx, args) => {
                const { storageIds, blobIds } = await ctx.runMutation(component.lib.gcOldAssets, {
                    currentDeploymentId: args.currentDeploymentId,
                });
                for (const storageId of storageIds) {
                    try {
                        await ctx.storage.delete(storageId);
                    }
                    catch {
                        // Ignore - old file may have been in different storage
                    }
                }
                // Update deployment info to trigger client reloads
                await ctx.runMutation(component.lib.setCurrentDeployment, {
                    deploymentId: args.currentDeploymentId,
                });
                // Return both counts and blobIds for CDN cleanup
                return { deleted: storageIds.length, blobIds };
            },
        }),
        /**
         * List all static assets (for debugging).
         */
        listAssets: internalQueryGeneric({
            args: {
                limit: v.optional(v.number()),
            },
            handler: async (ctx, args) => {
                return await ctx.runQuery(component.lib.listAssets, {
                    limit: args.limit,
                });
            },
        }),
    };
}
/**
 * Expose a query that clients can subscribe to for live reload on deploy.
 * When a new deployment happens, subscribed clients will be notified.
 *
 * @param component - The component API reference
 *
 * @example
 * ```typescript
 * // In your convex/staticHosting.ts
 * import { exposeUploadApi, exposeDeploymentQuery } from "@convex-dev/self-hosting";
 * import { components } from "./_generated/api";
 *
 * export const { generateUploadUrl, recordAsset, gcOldAssets, listAssets } =
 *   exposeUploadApi(components.selfHosting);
 *
 * export const { getCurrentDeployment } = exposeDeploymentQuery(components.selfHosting);
 * ```
 */
export function exposeDeploymentQuery(component) {
    return {
        /**
         * Get the current deployment info.
         * Subscribe to this query to detect when a new deployment happens.
         */
        getCurrentDeployment: queryGeneric({
            args: {},
            handler: async (ctx) => {
                return await ctx.runQuery(component.lib.getCurrentDeployment, {});
            },
        }),
    };
}
/**
 * Derive the Convex cloud URL from a .convex.site hostname.
 * Useful for client-side code that needs to connect to the Convex backend
 * when hosted on Convex static hosting.
 *
 * @example
 * ```typescript
 * // In your React app's main.tsx
 * import { getConvexUrl } from "@convex-dev/self-hosting";
 *
 * const convexUrl = import.meta.env.VITE_CONVEX_URL ?? getConvexUrl();
 * const convex = new ConvexReactClient(convexUrl);
 * ```
 */
export function getConvexUrl() {
    if (typeof window === "undefined") {
        throw new Error("getConvexUrl() can only be called in a browser context");
    }
    // If hosted on Convex (.convex.site), derive API URL (.convex.cloud)
    if (window.location.hostname.endsWith(".convex.site")) {
        return `https://${window.location.hostname.replace(".convex.site", ".convex.cloud")}`;
    }
    throw new Error("Unable to derive Convex URL. Please set VITE_CONVEX_URL environment variable.");
}
//# sourceMappingURL=index.js.map