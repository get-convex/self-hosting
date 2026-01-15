import { components } from "./_generated/api.js";
import {
  exposeUploadApi,
  exposeDeploymentQuery,
  exposeCachePurgeAction,
} from "@get-convex/self-static-hosting";

// Expose the upload API as INTERNAL functions.
// These can only be called via `npx convex run` - not from the public internet.
export const { generateUploadUrl, recordAsset, gcOldAssets, listAssets } =
  exposeUploadApi(components.selfStaticHosting);

// Expose the deployment query for live reload notifications.
// Clients subscribe to this to know when a new deployment is available.
export const { getCurrentDeployment } =
  exposeDeploymentQuery(components.selfStaticHosting);

// Optional: Expose cache purge action for Cloudflare CDN integration.
// Only needed if using Cloudflare as a CDN in front of your static site.
export const { purgeCloudflareCache } = exposeCachePurgeAction();
