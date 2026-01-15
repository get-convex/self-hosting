import {
  httpActionGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  queryGeneric,
} from "convex/server";
import type { HttpRouter } from "convex/server";
import { v } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";

// MIME type mapping for common file types
const MIME_TYPES: Record<string, string> = {
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
 * Get MIME type for a file path based on its extension.
 */
export function getMimeType(path: string): string {
  const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

/**
 * Check if a path has a file extension.
 */
function hasFileExtension(path: string): boolean {
  const lastSegment = path.split("/").pop() || "";
  return lastSegment.includes(".") && !lastSegment.startsWith(".");
}

/**
 * Check if asset is a hashed asset (for cache control).
 * Vite produces: index-lj_vq_aF.js, style-B71cUw87.css
 */
function isHashedAsset(path: string): boolean {
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
 * import { registerStaticRoutes } from "@get-convex/self-static-hosting";
 * import { components } from "./_generated/api";
 *
 * const http = httpRouter();
 *
 * // Serve static files at root
 * registerStaticRoutes(http, components.selfStaticHosting);
 *
 * // Or serve at a specific path prefix
 * registerStaticRoutes(http, components.selfStaticHosting, {
 *   pathPrefix: "/app",
 * });
 *
 * export default http;
 * ```
 */
export function registerStaticRoutes(
  http: HttpRouter,
  component: ComponentApi,
  {
    pathPrefix = "/",
    spaFallback = true,
  }: { pathPrefix?: string; spaFallback?: boolean } = {},
) {
  // Normalize pathPrefix - ensure it starts with / and doesn't end with /
  const normalizedPrefix =
    pathPrefix === "/" ? "" : pathPrefix.replace(/\/$/, "");

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

    // Look up the asset
    type AssetDoc = {
      _id: string;
      _creationTime: number;
      path: string;
      storageId: string;
      contentType: string;
      deploymentId: string;
    } | null;

    let asset: AssetDoc = await ctx.runQuery(component.lib.getByPath, { path });

    // SPA fallback: if not found and no file extension, serve index.html
    if (!asset && spaFallback && !hasFileExtension(path)) {
      asset = await ctx.runQuery(component.lib.getByPath, {
        path: "/index.html",
      });
    }

    // 404 if still not found
    if (!asset) {
      return new Response("Not Found", {
        status: 404,
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
 * import { exposeUploadApi } from "@get-convex/self-static-hosting";
 * import { components } from "./_generated/api";
 *
 * export const { generateUploadUrl, recordAsset, gcOldAssets, listAssets } =
 *   exposeUploadApi(components.selfStaticHosting);
 * ```
 *
 * Then deploy using:
 * ```bash
 * npm run deploy:static
 * ```
 */
export function exposeUploadApi(component: ComponentApi) {
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
     */
    recordAsset: internalMutationGeneric({
      args: {
        path: v.string(),
        storageId: v.string(),
        contentType: v.string(),
        deploymentId: v.string(),
      },
      handler: async (ctx, args) => {
        const oldStorageId = await ctx.runMutation(component.lib.recordAsset, {
          path: args.path,
          storageId: args.storageId,
          contentType: args.contentType,
          deploymentId: args.deploymentId,
        });
        if (oldStorageId) {
          try {
            await ctx.storage.delete(oldStorageId);
          } catch {
            // Ignore - old file may have been in different storage
          }
        }
        return null;
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
        const storageIdsToDelete = await ctx.runMutation(
          component.lib.gcOldAssets,
          {
            currentDeploymentId: args.currentDeploymentId,
          },
        );
        for (const storageId of storageIdsToDelete) {
          try {
            await ctx.storage.delete(storageId);
          } catch {
            // Ignore - old file may have been in different storage
          }
        }

        // Update deployment info to trigger client reloads
        await ctx.runMutation(component.lib.setCurrentDeployment, {
          deploymentId: args.currentDeploymentId,
        });

        return storageIdsToDelete.length;
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
 * import { exposeUploadApi, exposeDeploymentQuery } from "@get-convex/self-static-hosting";
 * import { components } from "./_generated/api";
 *
 * export const { generateUploadUrl, recordAsset, gcOldAssets, listAssets } =
 *   exposeUploadApi(components.selfStaticHosting);
 *
 * export const { getCurrentDeployment } = exposeDeploymentQuery(components.selfStaticHosting);
 * ```
 */
export function exposeDeploymentQuery(component: ComponentApi) {
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
 * import { getConvexUrl } from "@get-convex/self-static-hosting";
 *
 * const convexUrl = import.meta.env.VITE_CONVEX_URL ?? getConvexUrl();
 * const convex = new ConvexReactClient(convexUrl);
 * ```
 */
export function getConvexUrl(): string {
  if (typeof window === "undefined") {
    throw new Error("getConvexUrl() can only be called in a browser context");
  }

  // If hosted on Convex (.convex.site), derive API URL (.convex.cloud)
  if (window.location.hostname.endsWith(".convex.site")) {
    return `https://${window.location.hostname.replace(".convex.site", ".convex.cloud")}`;
  }

  throw new Error(
    "Unable to derive Convex URL. Please set VITE_CONVEX_URL environment variable.",
  );
}

/**
 * Expose an action to purge Cloudflare cache after deployment.
 * This is optional - only needed if you're using Cloudflare as a CDN.
 *
 * @example
 * ```typescript
 * // In your convex/staticHosting.ts
 * import { exposeCachePurgeAction } from "@get-convex/self-static-hosting";
 *
 * export const { purgeCloudflareCache } = exposeCachePurgeAction();
 * ```
 *
 * Then call after deployment:
 * ```bash
 * npx convex run staticHosting:purgeCloudflareCache \
 *   '{"zoneId": "your-zone-id", "apiToken": "your-api-token", "purgeAll": true}'
 * ```
 */
export function exposeCachePurgeAction() {
  return {
    /**
     * Purge Cloudflare cache after a deployment.
     * Can purge all files or specific URLs.
     */
    purgeCloudflareCache: internalActionGeneric({
      args: {
        zoneId: v.string(),
        apiToken: v.string(),
        purgeAll: v.optional(v.boolean()),
        files: v.optional(v.array(v.string())),
      },
      handler: async (ctx, args) => {
        const { zoneId, apiToken, purgeAll, files } = args;

        // Build request body
        let body: Record<string, unknown>;
        if (purgeAll) {
          body = { purge_everything: true };
        } else if (files && files.length > 0) {
          body = { files };
        } else {
          throw new Error(
            "Must specify either purgeAll: true or provide files array",
          );
        }

        // Call Cloudflare API
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          },
        );

        const result = (await response.json()) as {
          success: boolean;
          errors: Array<{ code: number; message: string }>;
        };

        if (!result.success) {
          throw new Error(
            `Cloudflare cache purge failed: ${JSON.stringify(result.errors)}`,
          );
        }

        return {
          success: true,
          purgedAll: purgeAll ?? false,
          purgedFiles: files?.length ?? 0,
        };
      },
    }),
  };
}
