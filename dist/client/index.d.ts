import type { HttpRouter } from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
/**
 * Get MIME type for a file path based on its extension.
 */
export declare function getMimeType(path: string): string;
export declare function registerStaticRoutes(http: HttpRouter, component: ComponentApi, { pathPrefix, spaFallback, cdnBaseUrl, }?: {
    pathPrefix?: string;
    spaFallback?: boolean;
    /** Base URL for CDN blob redirects (e.g., `(req) => \`${new URL(req.url).origin}/fs/blobs\``).
     * When set, assets with a blobId (non-HTML) will return a 302 redirect to `{cdnBaseUrl}/{blobId}`. */
    cdnBaseUrl?: string | ((request: Request) => string);
}): void;
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
export declare function exposeUploadApi(component: ComponentApi): {
    /**
     * Generate a signed URL for uploading a file.
     * Files are stored in the app's storage (not the component's).
     */
    generateUploadUrl: import("convex/server").RegisteredMutation<"internal", {}, Promise<string>>;
    /**
     * Record an uploaded asset in the database.
     * Automatically cleans up old storage files when replacing.
     * Pass storageId for Convex storage assets, or blobId for CDN assets.
     */
    recordAsset: import("convex/server").RegisteredMutation<"internal", {
        blobId?: string | undefined;
        storageId?: string | undefined;
        path: string;
        contentType: string;
        deploymentId: string;
    }, Promise<string | null>>;
    /**
     * Garbage collect old assets and notify clients of the new deployment.
     * Returns the count of deleted assets.
     * Also triggers connected clients to reload via the deployment subscription.
     */
    gcOldAssets: import("convex/server").RegisteredMutation<"internal", {
        currentDeploymentId: string;
    }, Promise<{
        deleted: number;
        blobIds: string[];
    }>>;
    /**
     * Generate multiple signed upload URLs in one call.
     * Much faster than calling generateUploadUrl N times.
     */
    generateUploadUrls: import("convex/server").RegisteredMutation<"internal", {
        count: number;
    }, Promise<string[]>>;
    /**
     * Record multiple uploaded assets in one call.
     */
    recordAssets: import("convex/server").RegisteredMutation<"internal", {
        assets: {
            path: string;
            contentType: string;
            deploymentId: string;
            storageId: string;
        }[];
    }, Promise<void>>;
    /**
     * List all static assets (for debugging).
     */
    listAssets: import("convex/server").RegisteredQuery<"internal", {
        limit?: number | undefined;
    }, Promise<{
        _creationTime: number;
        _id: string;
        blobId?: string;
        contentType: string;
        deploymentId: string;
        path: string;
        storageId?: string;
    }[]>>;
};
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
export declare function exposeDeploymentQuery(component: ComponentApi): {
    /**
     * Get the current deployment info.
     * Subscribe to this query to detect when a new deployment happens.
     */
    getCurrentDeployment: import("convex/server").RegisteredQuery<"public", {}, Promise<{
        _creationTime: number;
        _id: string;
        currentDeploymentId: string;
        deployedAt: number;
    } | null>>;
};
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
export declare function getConvexUrl(): string;
//# sourceMappingURL=index.d.ts.map