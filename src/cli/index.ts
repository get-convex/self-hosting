#!/usr/bin/env node
/**
 * CLI for Convex Self Static Hosting
 *
 * Commands:
 *   upload              Upload static files to Convex
 *   setup-cloudflare    Interactive Cloudflare CDN setup
 *   init                Print setup instructions
 */

const command = process.argv[2];

async function main() {
  switch (command) {
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
  upload              Upload static files to Convex storage
  setup-cloudflare    Interactive Cloudflare CDN setup wizard
  init                Print setup instructions for integration

Examples:
  npx @get-convex/self-static-hosting upload
  npx @get-convex/self-static-hosting upload --dist ./build
  npx @get-convex/self-static-hosting setup-cloudflare
  npx @get-convex/self-static-hosting init

Run '<command> --help' for more information on a specific command.
`);
}

function printInitInstructions() {
  console.log(`
# Convex Self Static Hosting - Setup Instructions

## 1. Install the component

\`\`\`bash
npm install @get-convex/self-static-hosting
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

## 3. Create HTTP routes

\`\`\`typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@get-convex/self-static-hosting";
import { components } from "./_generated/api";

const http = httpRouter();

// Serve static files (use pathPrefix for CDN setups)
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

// Internal functions for secure uploads
export const { generateUploadUrl, recordAsset, gcOldAssets, listAssets } =
  exposeUploadApi(components.selfStaticHosting);

// Optional: Live reload notifications
export const { getCurrentDeployment } =
  exposeDeploymentQuery(components.selfStaticHosting);
\`\`\`

## 5. Add deploy script to package.json

\`\`\`json
{
  "scripts": {
    "build": "vite build",
    "deploy:static": "npm run build && npx @get-convex/self-static-hosting upload"
  }
}
\`\`\`

## 6. Deploy

\`\`\`bash
npm run deploy:static
\`\`\`

## Optional: Cloudflare CDN Setup

\`\`\`bash
npx @get-convex/self-static-hosting setup-cloudflare
\`\`\`

This interactive wizard will:
- Login to Cloudflare
- Help you select or add a domain
- Configure DNS pointing to your Convex site
- Create an API token for cache purging
- Save credentials to .env.local

Then just deploy - cache is purged automatically!
`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
