import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server.js";

// Validator for static asset documents (including system fields)
const staticAssetValidator = v.object({
  _id: v.id("staticAssets"),
  _creationTime: v.number(),
  path: v.string(),
  storageId: v.optional(v.id("_storage")),
  blobId: v.optional(v.string()),
  contentType: v.string(),
  deploymentId: v.string(),
});

/**
 * Look up an asset by its URL path.
 */
export const getByPath = query({
  args: { path: v.string() },
  returns: v.union(staticAssetValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("staticAssets")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .unique();
  },
});

/**
 * Generate a signed URL for uploading a file to Convex storage.
 * Note: This is kept for backwards compatibility but the recommended approach
 * is to use the app's storage directly via exposeUploadApi().
 */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Record an asset in the database after uploading to storage.
 * If an asset already exists at this path, returns the old storageId for cleanup.
 * 
 * Note: Storage files are stored in the app's storage, not the component's storage.
 * The caller is responsible for deleting the returned storageId from app storage.
 */
export const recordAsset = mutation({
  args: {
    path: v.string(),
    storageId: v.optional(v.id("_storage")),
    blobId: v.optional(v.string()),
    contentType: v.string(),
    deploymentId: v.string(),
  },
  returns: v.object({
    oldStorageId: v.union(v.id("_storage"), v.null()),
    oldBlobId: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    // Check if asset already exists at this path
    const existing = await ctx.db
      .query("staticAssets")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .unique();

    let oldStorageId = null;
    let oldBlobId = null;
    if (existing) {
      oldStorageId = existing.storageId ?? null;
      oldBlobId = existing.blobId ?? null;
      // Delete old record
      await ctx.db.delete(existing._id);
    }

    // Insert new asset
    await ctx.db.insert("staticAssets", {
      path: args.path,
      ...(args.storageId ? { storageId: args.storageId } : {}),
      ...(args.blobId ? { blobId: args.blobId } : {}),
      contentType: args.contentType,
      deploymentId: args.deploymentId,
    });

    // Return old IDs so caller can clean up
    return { oldStorageId, oldBlobId };
  },
});

/**
 * Garbage collect assets from old deployments.
 * Returns the storageIds that need to be deleted from app storage.
 */
export const gcOldAssets = mutation({
  args: {
    currentDeploymentId: v.string(),
  },
  returns: v.object({
    storageIds: v.array(v.id("_storage")),
    blobIds: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const oldAssets = await ctx.db.query("staticAssets").collect();
    const storageIds: Array<string> = [];
    const blobIds: Array<string> = [];

    for (const asset of oldAssets) {
      if (asset.deploymentId !== args.currentDeploymentId) {
        if (asset.storageId) {
          storageIds.push(asset.storageId as unknown as string);
        }
        if (asset.blobId) {
          blobIds.push(asset.blobId);
        }
        // Delete database record
        await ctx.db.delete(asset._id);
      }
    }

    return {
      storageIds: storageIds as unknown as Array<ReturnType<typeof v.id<"_storage">>["type"]>,
      blobIds,
    };
  },
});

/**
 * List all assets (useful for debugging).
 */
export const listAssets = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(staticAssetValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("staticAssets")
      .order("asc")
      .take(args.limit ?? 100);
  },
});

/**
 * Delete all assets records (useful for cleanup).
 * Returns storageIds that need to be deleted from app storage.
 */
export const deleteAllAssets = internalMutation({
  args: {},
  returns: v.object({
    storageIds: v.array(v.id("_storage")),
    blobIds: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const assets = await ctx.db.query("staticAssets").collect();
    const storageIds: Array<string> = [];
    const blobIds: Array<string> = [];

    for (const asset of assets) {
      if (asset.storageId) {
        storageIds.push(asset.storageId as unknown as string);
      }
      if (asset.blobId) {
        blobIds.push(asset.blobId);
      }
      await ctx.db.delete(asset._id);
    }

    return {
      storageIds: storageIds as unknown as Array<ReturnType<typeof v.id<"_storage">>["type"]>,
      blobIds,
    };
  },
});

// ============================================================================
// Deployment Tracking - for live reload on deploy
// ============================================================================

const deploymentInfoValidator = v.object({
  _id: v.id("deploymentInfo"),
  _creationTime: v.number(),
  currentDeploymentId: v.string(),
  deployedAt: v.number(),
});

/**
 * Get the current deployment info.
 * Clients subscribe to this to detect when a new deployment happens.
 */
export const getCurrentDeployment = query({
  args: {},
  returns: v.union(deploymentInfoValidator, v.null()),
  handler: async (ctx) => {
    return await ctx.db.query("deploymentInfo").first();
  },
});

/**
 * Update the current deployment ID.
 * Called after a successful deployment to notify all connected clients.
 */
export const setCurrentDeployment = mutation({
  args: {
    deploymentId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Get existing deployment info
    const existing = await ctx.db.query("deploymentInfo").first();

    if (existing) {
      // Update existing record
      await ctx.db.patch(existing._id, {
        currentDeploymentId: args.deploymentId,
        deployedAt: Date.now(),
      });
    } else {
      // Create new record
      await ctx.db.insert("deploymentInfo", {
        currentDeploymentId: args.deploymentId,
        deployedAt: Date.now(),
      });
    }

    return null;
  },
});
