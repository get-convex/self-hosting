import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  staticAssets: defineTable({
    path: v.string(), // URL path, e.g., "/index.html", "/assets/main-abc123.js"
    storageId: v.optional(v.id("_storage")), // Reference to Convex file storage (used for HTML + non-CDN assets)
    blobId: v.optional(v.string()), // convex-fs blob ID (used for CDN-served assets)
    contentType: v.string(), // MIME type, e.g., "text/html; charset=utf-8"
    deploymentId: v.string(), // UUID for garbage collection
  })
    .index("by_path", ["path"])
    .index("by_deploymentId", ["deploymentId"]),

  // Singleton table to track the current deployment
  // Clients subscribe to this to know when to reload
  deploymentInfo: defineTable({
    currentDeploymentId: v.string(),
    deployedAt: v.number(), // timestamp
  }),
});
