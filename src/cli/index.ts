#!/usr/bin/env node
/**
 * CLI for Convex Self Static Hosting
 *
 * Commands:
 *   deploy              One-shot deployment (Convex backend + static files)
 *   upload              Upload static files to Convex or Cloudflare Workers
 *   setup-cloudflare    Interactive Cloudflare setup wizard
 *   init                Print setup instructions
 */

const command = process.argv[2];

async function main() {
  switch (command) {
    case "deploy":
      // Pass remaining args to deploy command
      process.argv.splice(2, 1);
      await import("./deploy.js");
      break;

    case "upload":
      // Pass remaining args to upload command
      process.argv.splice(2, 1);
      await import("./upload.js");
      break;

    case "setup-cloudflare":
    case "setup-cf":
    case "cloudflare":
      await import("./setup-cloudflare.js");
      break;

    case "init":
      printInitInstructions();
      break;

    case "--help":
    case "-h":
    case undefined:
      printHelp();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log("");
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  console.log(`
Convex Self Static Hosting CLI

Usage:
  npx @get-convex/self-static-hosting <command> [options]

Commands:
  deploy              One-shot deployment (Convex backend + static files)
  upload              Upload static files to Convex storage or Cloudflare Workers
  setup-cloudflare    Interactive Cloudflare setup wizard
  init                Print setup instructions for integration

Examples:
  # One-shot deployment to Cloudflare Workers
  npx @get-convex/self-static-hosting deploy --cloudflare-workers --worker-name my-app

  # One-shot deployment to Convex storage
  npx @get-convex/self-static-hosting deploy

  # Upload only (no Convex backend deploy)
  npx @get-convex/self-static-hosting upload --build --prod

  # Interactive Cloudflare setup
  npx @get-convex/self-static-hosting setup-cloudflare

Run '<command> --help' for more information on a specific command.
`);
}

function printInitInstructions() {
  console.log(`
# Convex Self Static Hosting - Setup Instructions

## 1. Install the component

\`\`\`bash
npm install github:get-convex/self-static-hosting#main
\`\`\`

## 2. Add to convex.config.ts

\`\`\`typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import selfStaticHosting from "@get-convex/self-static-hosting/convex.config.js";

const app = defineApp();
app.use(selfStaticHosting);

export default app;
\`\`\`

## 3. Create HTTP routes (only needed for Convex storage mode)

\`\`\`typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@get-convex/self-static-hosting";
import { components } from "./_generated/api";

const http = httpRouter();

// Serve static files (skip this if using Cloudflare Workers)
registerStaticRoutes(http, components.selfStaticHosting, {
  pathPrefix: "/",  // or "/app" to keep API routes separate
  spaFallback: true,
});

export default http;
\`\`\`

## 4. Expose upload API

\`\`\`typescript
// convex/staticHosting.ts
import { exposeUploadApi, exposeDeploymentQuery } from "@get-convex/self-static-hosting";
import { components } from "./_generated/api";

// Internal functions for secure uploads (needed for Convex storage mode)
export const { generateUploadUrl, recordAsset, gcOldAssets, listAssets } =
  exposeUploadApi(components.selfStaticHosting);

// Optional: Live reload notifications (works with both modes)
export const { getCurrentDeployment } =
  exposeDeploymentQuery(components.selfStaticHosting);
\`\`\`

## 5. Add deploy script to package.json

\`\`\`json
{
  "scripts": {
    "build": "vite build",
    "deploy": "npx @get-convex/self-static-hosting deploy --cloudflare-workers --worker-name my-app"
  }
}
\`\`\`

Or for Convex storage mode:

\`\`\`json
{
  "scripts": {
    "deploy": "npx @get-convex/self-static-hosting deploy"
  }
}
\`\`\`

## 6. Deploy

\`\`\`bash
# Login first
npx convex login
npx wrangler login  # if using Cloudflare Workers

# One-shot deployment (backend + static files)
npm run deploy
\`\`\`

## Cloudflare Setup (Recommended)

\`\`\`bash
npx @get-convex/self-static-hosting setup-cloudflare
\`\`\`

This interactive wizard will help you choose between:

1. **Cloudflare Workers** (recommended)
   - Files served directly from Cloudflare edge
   - No Convex storage costs for static assets
   - Built-in SPA routing

2. **Convex Storage + Cloudflare CDN**
   - Files stored in Convex, cached by Cloudflare
   - Good if you want everything in Convex

The wizard handles all configuration and saves credentials to .env.local.
`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
