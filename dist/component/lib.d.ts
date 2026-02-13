import { v } from "convex/values";
/**
 * Look up an asset by its URL path.
 */
export declare const getByPath: import("convex/server").RegisteredQuery<"public", {
    path: string;
}, Promise<{
    _id: import("convex/values").GenericId<"staticAssets">;
    _creationTime: number;
    storageId?: import("convex/values").GenericId<"_storage"> | undefined;
    blobId?: string | undefined;
    path: string;
    contentType: string;
    deploymentId: string;
} | null>>;
/**
 * Generate a signed URL for uploading a file to Convex storage.
 * Note: This is kept for backwards compatibility but the recommended approach
 * is to use the app's storage directly via exposeUploadApi().
 */
export declare const generateUploadUrl: import("convex/server").RegisteredMutation<"public", {}, Promise<string>>;
/**
 * Record an asset in the database after uploading to storage.
 * If an asset already exists at this path, returns the old storageId for cleanup.
 *
 * Note: Storage files are stored in the app's storage, not the component's storage.
 * The caller is responsible for deleting the returned storageId from app storage.
 */
export declare const recordAsset: import("convex/server").RegisteredMutation<"public", {
    storageId?: import("convex/values").GenericId<"_storage"> | undefined;
    blobId?: string | undefined;
    path: string;
    contentType: string;
    deploymentId: string;
}, Promise<{
    oldStorageId: import("convex/values").GenericId<"_storage"> | null;
    oldBlobId: string | null;
}>>;
/**
 * Garbage collect assets from old deployments.
 * Returns the storageIds that need to be deleted from app storage.
 */
export declare const gcOldAssets: import("convex/server").RegisteredMutation<"public", {
    currentDeploymentId: string;
}, Promise<{
    storageIds: Array<ReturnType<typeof v.id<"_storage">>["type"]>;
    blobIds: string[];
}>>;
/**
 * List all assets (useful for debugging).
 */
export declare const listAssets: import("convex/server").RegisteredQuery<"public", {
    limit?: number | undefined;
}, Promise<{
    _id: import("convex/values").GenericId<"staticAssets">;
    _creationTime: number;
    storageId?: import("convex/values").GenericId<"_storage"> | undefined;
    blobId?: string | undefined;
    path: string;
    contentType: string;
    deploymentId: string;
}[]>>;
/**
 * Delete all assets records (useful for cleanup).
 * Returns storageIds that need to be deleted from app storage.
 */
export declare const deleteAllAssets: import("convex/server").RegisteredMutation<"internal", {}, Promise<{
    storageIds: Array<ReturnType<typeof v.id<"_storage">>["type"]>;
    blobIds: string[];
}>>;
/**
 * Get the current deployment info.
 * Clients subscribe to this to detect when a new deployment happens.
 */
export declare const getCurrentDeployment: import("convex/server").RegisteredQuery<"public", {}, Promise<{
    _id: import("convex/values").GenericId<"deploymentInfo">;
    _creationTime: number;
    currentDeploymentId: string;
    deployedAt: number;
} | null>>;
/**
 * Update the current deployment ID.
 * Called after a successful deployment to notify all connected clients.
 */
export declare const setCurrentDeployment: import("convex/server").RegisteredMutation<"public", {
    deploymentId: string;
}, Promise<null>>;
//# sourceMappingURL=lib.d.ts.map