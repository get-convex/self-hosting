import { components } from "./_generated/api.js";
import {
  exposeUploadApi,
  exposeDeploymentQuery,
} from "@convex-dev/self-hosting";

// Expose the upload API as INTERNAL functions.
// These can only be called via `npx convex run` - not from the public internet.
export const { generateUploadUrl, generateUploadUrls, recordAsset, recordAssets, gcOldAssets, listAssets } =
  exposeUploadApi(components.selfHosting);

// Expose the deployment query for live reload notifications.
// Clients subscribe to this to know when a new deployment is available.
export const { getCurrentDeployment } =
  exposeDeploymentQuery(components.selfHosting);
