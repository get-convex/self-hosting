# Convex Static Site Hosting - Complete Implementation Guide

## Overview

This implementation allows self-hosting static React/Vite apps using Convex HTTP actions and file storage, eliminating the need for Vercel or other hosting providers.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BUILD PHASE                                     │
│  npm run build → Vite creates dist/ with index.html, JS, CSS, assets        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              UPLOAD PHASE                                    │
│  1. Generate unique deploymentId (UUID)                                      │
│  2. For each file in dist/:                                                  │
│     a. Call generateUploadUrl mutation → get signed URL                      │
│     b. POST file content to signed URL → get storageId                       │
│     c. Call recordAsset mutation → store path→storageId mapping              │
│  3. Call gcOldAssets mutation → delete files with old deploymentIds          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SERVE PHASE                                     │
│  Browser requests https://deployment.convex.site/some/path                   │
│     → HTTP action receives request                                           │
│     → Query staticAssets table for path                                      │
│     → If not found & SPA mode & no file extension → try /index.html          │
│     → Fetch blob from ctx.storage.get(storageId)                             │
│     → Return Response with correct Content-Type and Cache-Control            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Database Schema

### Table: `staticAssets`

```typescript
import { defineTable } from "convex/server";
import { v } from "convex/values";

defineTable({
  path: v.string(),              // URL path, e.g., "/index.html", "/assets/main-abc123.js"
  storageId: v.id("_storage"),   // Reference to Convex file storage
  contentType: v.string(),       // MIME type, e.g., "text/html; charset=utf-8"
  deploymentId: v.string(),      // UUID for garbage collection
})
  .index("by_path", ["path"])
  .index("by_deploymentId", ["deploymentId"])
```

## Convex Functions

### 1. `getByPath` - Query to look up assets

```typescript
import { query } from "./_generated/server";
import { v } from "convex/values";

export const getByPath = query({
  args: { path: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("staticAssets"),
      _creationTime: v.number(),  // IMPORTANT: Include this or validation fails
      path: v.string(),
      storageId: v.id("_storage"),
      contentType: v.string(),
      deploymentId: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("staticAssets")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .unique();
  },
});
```

### 2. `generateUploadUrl` - Get signed URL for upload

```typescript
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});
```

### 3. `recordAsset` - Store asset metadata (upsert)

```typescript
export const recordAsset = mutation({
  args: {
    path: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
    deploymentId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Check if asset already exists at this path
    const existing = await ctx.db
      .query("staticAssets")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .unique();

    if (existing) {
      // Delete old storage file to avoid orphans
      await ctx.storage.delete(existing.storageId);
      // Delete old record
      await ctx.db.delete(existing._id);
    }

    // Insert new asset
    await ctx.db.insert("staticAssets", {
      path: args.path,
      storageId: args.storageId,
      contentType: args.contentType,
      deploymentId: args.deploymentId,
    });

    return null;
  },
});
```

### 4. `gcOldAssets` - Garbage collect previous deployments

```typescript
export const gcOldAssets = mutation({
  args: {
    currentDeploymentId: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const oldAssets = await ctx.db.query("staticAssets").collect();
    let deletedCount = 0;

    for (const asset of oldAssets) {
      if (asset.deploymentId !== args.currentDeploymentId) {
        // Delete from file storage
        await ctx.storage.delete(asset.storageId);
        // Delete database record
        await ctx.db.delete(asset._id);
        deletedCount++;
      }
    }

    return deletedCount;
  },
});
```

## HTTP Handler (convex/http.ts)

```typescript
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

// Helper: Check if path has a file extension
function hasFileExtension(path: string): boolean {
  const lastSegment = path.split("/").pop() || "";
  return lastSegment.includes(".") && !lastSegment.startsWith(".");
}

// Helper: Check if asset is hashed (for cache control)
// Vite produces: index-lj_vq_aF.js, style-B71cUw87.css
function isHashedAsset(path: string): boolean {
  return /[-.][\dA-Za-z_]{6,12}\.[a-z]+$/.test(path);
}

// Static file server with SPA support
const serveStaticFile = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  let path = url.pathname;

  // Normalize: serve index.html for root
  if (path === "" || path === "/") {
    path = "/index.html";
  }

  // Look up the asset
  type AssetDoc = {
    _id: string;
    path: string;
    storageId: string;
    contentType: string;
    deploymentId: string;
  } | null;

  let asset: AssetDoc = await ctx.runQuery(api.staticAssets.getByPath, { path });

  // SPA fallback: if not found and no file extension, serve index.html
  if (!asset && !hasFileExtension(path)) {
    asset = await ctx.runQuery(api.staticAssets.getByPath, { path: "/index.html" });
  }

  // 404 if still not found
  if (!asset) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
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
      "X-Content-Type-Options": "nosniff",
    },
  });
});

// Catch-all route with pathPrefix
http.route({
  pathPrefix: "/",
  method: "GET",
  handler: serveStaticFile,
});

export default http;
```

## Upload Script (scripts/upload-static.ts)

```typescript
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, relative, dirname, extname } from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "../dist");

// MIME type mapping
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
};

function getMimeType(path: string): string {
  return MIME_TYPES[extname(path).toLowerCase()] || "application/octet-stream";
}

// Recursively collect files
function collectFiles(dir: string, baseDir: string) {
  const files: Array<{ path: string; localPath: string; contentType: string }> = [];
  
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      files.push({
        path: "/" + relative(baseDir, fullPath).replace(/\\/g, "/"),
        localPath: fullPath,
        contentType: getMimeType(fullPath),
      });
    }
  }
  return files;
}

async function main() {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) {
    console.error("Error: CONVEX_URL environment variable required");
    process.exit(1);
  }

  if (!existsSync(distDir)) {
    console.error("Error: dist directory not found. Run 'npm run build' first.");
    process.exit(1);
  }

  const client = new ConvexHttpClient(convexUrl);
  const deploymentId = randomUUID();
  const files = collectFiles(distDir, distDir);

  console.log(`Uploading ${files.length} files...`);

  for (const file of files) {
    const content = readFileSync(file.localPath);
    
    // Get upload URL
    const uploadUrl = await client.mutation(api.staticAssets.generateUploadUrl);
    
    // Upload to storage
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.contentType },
      body: content,
    });
    
    const { storageId } = await response.json() as { storageId: Id<"_storage"> };
    
    // Record in database
    await client.mutation(api.staticAssets.recordAsset, {
      path: file.path,
      storageId,
      contentType: file.contentType,
      deploymentId,
    });
    
    console.log(`  ${file.path}`);
  }

  // Garbage collect old files
  const deleted = await client.mutation(api.staticAssets.gcOldAssets, {
    currentDeploymentId: deploymentId,
  });
  
  console.log(`\nDeleted ${deleted} old files`);
  console.log(`App available at: ${convexUrl.replace(".convex.cloud", ".convex.site")}`);
}

main().catch(console.error);
```

## Client-Side: Auto-detect Convex URL

When self-hosted, the app needs to derive the Convex URL from the current location:

```typescript
// src/main.tsx
function getConvexUrl(): string {
  // Prefer environment variable (works in dev with Vite)
  if (import.meta.env.VITE_CONVEX_URL) {
    return import.meta.env.VITE_CONVEX_URL as string;
  }
  
  // If hosted on Convex (.convex.site), derive API URL (.convex.cloud)
  if (window.location.hostname.endsWith(".convex.site")) {
    return `https://${window.location.hostname.replace(".convex.site", ".convex.cloud")}`;
  }
  
  throw new Error("VITE_CONVEX_URL not set and not hosted on Convex.");
}

const convex = new ConvexReactClient(getConvexUrl());
```

## Vite Configuration: Module Deduplication

**CRITICAL**: When importing from shared modules outside the project, React and Convex can be duplicated, causing runtime errors. Fix with aliases:

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // IMPORTANT: Deduplicate React and Convex to avoid multiple instances
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
      "convex/react": path.resolve(__dirname, "./node_modules/convex/react"),
    },
  },
});
```

Without this, you'll see errors like:
- `Cannot read properties of null (reading 'useRef')` - duplicate React
- `Could not find Convex client! useMutation must be used under ConvexProvider` - duplicate convex/react

## Package.json Scripts

```json
{
  "scripts": {
    "build": "vite build",
    "upload:static": "npx tsx scripts/upload-static.ts",
    "deploy:static": "npm run build && npm run upload:static"
  }
}
```

## Usage

```bash
# Deploy
CONVEX_URL=https://your-deployment.convex.cloud npm run deploy:static

# App is now live at:
# https://your-deployment.convex.site/
```

## CDN Mode (Optional)

For better performance, non-HTML static assets can be served from a CDN via [convex-fs](https://convexfs.dev) instead of Convex storage. HTML files continue to be served from Convex (needed for SPA routing).

**How it works**: When CDN mode is enabled, the HTTP action returns a 302 redirect to the convex-fs blob endpoint for non-HTML assets. convex-fs then redirects to a signed CDN URL (Bunny.net). For hashed assets, the browser caches after the first load.

**Schema change**: The `staticAssets` table now supports both `storageId` (optional) and `blobId` (optional). An asset has either a `storageId` (Convex storage) or a `blobId` (CDN).

**Deploy command**: `npx @convex-dev/self-hosting deploy --cdn`

See `INTEGRATION.md` for full CDN setup instructions.

## Key Learnings / Gotchas

1. **Return validator must include `_creationTime`** - Convex adds this automatically to all documents, and the return validator must include it.

2. **Vite hash pattern**: Vite uses base64-like hashes (e.g., `lj_vq_aF`), not hex. Regex: `/[-.][\dA-Za-z_]{6,12}\.[a-z]+$/`

3. **Module deduplication**: Essential when importing from outside node_modules to avoid duplicate React/Convex instances.

4. **SPA fallback logic**: Only fallback to index.html for paths WITHOUT file extensions. Paths like `/assets/missing.js` should 404.

5. **Garbage collection**: Use a unique deploymentId per upload, then delete everything with a different deploymentId. This cleans up old hashed assets.

6. **URL derivation**: `.convex.site` → `.convex.cloud` transformation for self-hosted apps.

## File Structure

After implementation, your project should have:

```
your-app/
├── convex/
│   ├── schema.ts          # Add staticAssets table
│   ├── staticAssets.ts    # getByPath, generateUploadUrl, recordAsset, gcOldAssets
│   └── http.ts            # Static file serving with SPA support
├── scripts/
│   └── upload-static.ts   # Upload script with GC
├── src/
│   └── main.tsx           # Auto-detect Convex URL
├── vite.config.ts         # Module deduplication
└── package.json           # deploy:static script
```
