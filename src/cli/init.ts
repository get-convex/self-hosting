#!/usr/bin/env node
/**
 * Output integration instructions for LLMs.
 *
 * Usage:
 *   npx @get-convex/self-static-hosting init
 */

const instructions = `
# Convex Self Static Hosting - Integration Instructions

You are integrating the @get-convex/self-static-hosting component into a Convex app.
This component enables hosting static files (React/Vite apps) directly on Convex.

## What This Component Does

- Stores static files in Convex storage
- Serves files via HTTP actions with proper MIME types
- Supports SPA routing (fallback to index.html)
- Smart caching: hashed assets cached forever, HTML revalidates
- ETag support for efficient cache revalidation
- Live reload notifications when new deployments happen
- Optional Cloudflare CDN integration

## Files to Create/Modify

### 1. convex/convex.config.ts (create or modify)

\`\`\`typescript
import { defineApp } from "convex/server";
import selfStaticHosting from "@get-convex/self-static-hosting/convex.config";

const app = defineApp();
app.use(selfStaticHosting);

export default app;
\`\`\`

### 2. convex/staticHosting.ts (create)

\`\`\`typescript
import { components } from "./_generated/api";
import {
  exposeUploadApi,
  exposeDeploymentQuery,
  exposeCachePurgeAction,
} from "@get-convex/self-static-hosting";

// Internal functions for secure uploads (only callable via CLI)
export const { generateUploadUrl, recordAsset, gcOldAssets, listAssets } =
  exposeUploadApi(components.selfStaticHosting);

// Public query for live reload notifications
export const { getCurrentDeployment } =
  exposeDeploymentQuery(components.selfStaticHosting);

// Optional: Cloudflare cache purge (for CI/CD)
export const { purgeCloudflareCache } = exposeCachePurgeAction();
\`\`\`

### 3. convex/http.ts (create or modify)

\`\`\`typescript
import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@get-convex/self-static-hosting";
import { components } from "./_generated/api";

const http = httpRouter();

// Option A: Serve at root (if no other HTTP routes)
registerStaticRoutes(http, components.selfStaticHosting);

// Option B: Serve at /app/ prefix (recommended if you have API routes)
// registerStaticRoutes(http, components.selfStaticHosting, {
//   pathPrefix: "/app",
// });

// Add other HTTP routes here if needed
// http.route({ path: "/api/webhook", method: "POST", handler: ... });

export default http;
\`\`\`

### 4. package.json scripts (add)

\`\`\`json
{
  "scripts": {
    "build": "vite build",
    "deploy:static": "npm run build && npx @get-convex/self-static-hosting upload"
  }
}
\`\`\`

If using a path prefix, specify the module:
\`\`\`json
{
  "scripts": {
    "deploy:static": "npm run build && npx @get-convex/self-static-hosting upload --module staticHosting"
  }
}
\`\`\`

### 5. src/main.tsx (modify entry point)

\`\`\`typescript
import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { getConvexUrlWithFallback } from "@get-convex/self-static-hosting";
import App from "./App";

// Auto-detects Convex URL when deployed to *.convex.site
const convexUrl = getConvexUrlWithFallback(import.meta.env.VITE_CONVEX_URL);
const convex = new ConvexReactClient(convexUrl);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </React.StrictMode>
);
\`\`\`

### 6. src/App.tsx (optional: add live reload banner)

\`\`\`typescript
import { UpdateBanner } from "@get-convex/self-static-hosting/react";
import { api } from "../convex/_generated/api";

function App() {
  return (
    <div>
      {/* Shows banner when new deployment is available */}
      <UpdateBanner
        getCurrentDeployment={api.staticHosting.getCurrentDeployment}
        message="New version available!"
        buttonText="Refresh"
      />
      
      {/* Rest of your app */}
    </div>
  );
}
\`\`\`

Or use the hook for custom UI:
\`\`\`typescript
import { useDeploymentUpdates } from "@get-convex/self-static-hosting/react";
import { api } from "../convex/_generated/api";

function App() {
  const { updateAvailable, reload, dismiss } = useDeploymentUpdates(
    api.staticHosting.getCurrentDeployment
  );
  
  // Custom update notification UI
}
\`\`\`

## Deployment

\`\`\`bash
# Login to Convex (first time)
npx convex login

# Push Convex functions
npx convex dev --once

# Build and deploy static files
npm run deploy:static

# Your app is now live at:
# https://your-deployment.convex.site
# (or https://your-deployment.convex.site/app/ if using path prefix)
\`\`\`

## Optional: Cloudflare CDN

For production with custom domain and edge caching:

\`\`\`bash
# Login to Cloudflare
npx wrangler login

# Deploy with automatic cache purge
npx @get-convex/self-static-hosting upload --domain yourdomain.com
\`\`\`

Or for CI/CD, set environment variables:
\`\`\`bash
export CLOUDFLARE_ZONE_ID="your-zone-id"
export CLOUDFLARE_API_TOKEN="your-api-token"
npm run deploy:static
\`\`\`

## Important Notes

1. The upload functions are INTERNAL - they can only be called via \`npx convex run\`, not from the public internet
2. Static files are stored in the app's storage (not the component's) for proper isolation
3. Hashed assets (e.g., main-abc123.js) get immutable caching; HTML files always revalidate
4. The component supports SPA routing - routes without file extensions serve index.html
`;

console.log(instructions);
