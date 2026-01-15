# Convex Self Static Hosting

[![npm version](https://badge.fury.io/js/@get-convex%2Fself-static-hosting.svg)](https://badge.fury.io/js/@get-convex/self-static-hosting)

A Convex component that enables self-hosting static React/Vite apps using Convex HTTP actions and file storage. No external hosting provider required!

## Features

- 🚀 **Simple deployment** - Upload your built files directly to Convex storage
- 🔒 **Secure by default** - Upload API uses internal functions (not publicly accessible)
- 🔄 **SPA support** - Automatic fallback to index.html for client-side routing
- ⚡ **Smart caching** - Hashed assets get long-term caching, HTML is always fresh
- 🧹 **Auto cleanup** - Old deployment files are automatically garbage collected
- 📦 **Zero config** - Works out of the box with Vite, Create React App, and other bundlers

## Installation

Install the component:

```bash
npm install @get-convex/self-static-hosting
```

Add to your `convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import selfStaticHosting from "@get-convex/self-static-hosting/convex.config.js";

const app = defineApp();
app.use(selfStaticHosting);

export default app;
```

## Setup

### 1. Register HTTP routes

Create or update `convex/http.ts` to serve static files:

```ts
import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@get-convex/self-static-hosting";
import { components } from "./_generated/api";

const http = httpRouter();

// Serve static files at the root path with SPA fallback
registerStaticRoutes(http, components.selfStaticHosting);

export default http;
```

### 2. Expose upload API (internal functions)

Create a file like `convex/staticHosting.ts`:

```ts
import { exposeUploadApi } from "@get-convex/self-static-hosting";
import { components } from "./_generated/api";

// These are INTERNAL functions - only callable via `npx convex run`
// NOT accessible from the public internet
export const { generateUploadUrl, recordAsset, gcOldAssets, listAssets } =
  exposeUploadApi(components.selfStaticHosting);
```

### 3. Create upload script

Create `scripts/upload-static.ts`:

```ts
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, relative, dirname, extname } from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "../dist");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function getMimeType(path: string): string {
  return MIME_TYPES[extname(path).toLowerCase()] || "application/octet-stream";
}

function convexRun(fn: string, args: Record<string, unknown> = {}): string {
  const cmd = `npx convex run "${fn}" '${JSON.stringify(args)}' --typecheck=disable --codegen=disable`;
  return execSync(cmd, { encoding: "utf-8" }).trim();
}

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
  if (!existsSync(distDir)) {
    console.error("dist/ not found. Run 'npm run build' first.");
    process.exit(1);
  }

  const deploymentId = randomUUID();
  const files = collectFiles(distDir, distDir);

  console.log(`Uploading ${files.length} files...`);

  for (const file of files) {
    const uploadUrl = JSON.parse(convexRun("staticHosting:generateUploadUrl"));
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.contentType },
      body: readFileSync(file.localPath),
    });
    const { storageId } = await response.json();
    
    convexRun("staticHosting:recordAsset", {
      path: file.path,
      storageId,
      contentType: file.contentType,
      deploymentId,
    });
    console.log(`  ✓ ${file.path}`);
  }

  const deleted = JSON.parse(convexRun("staticHosting:gcOldAssets", { currentDeploymentId: deploymentId }));
  console.log(`Cleaned up ${deleted} old files`);
}

main().catch(console.error);
```

### 4. Add scripts to package.json

```json
{
  "scripts": {
    "build": "vite build",
    "upload:static": "npx tsx scripts/upload-static.ts",
    "deploy:static": "npm run build && npm run upload:static"
  }
}
```

### 5. Update your app's entry point (optional)

In your `main.tsx`, use the helper to auto-detect the Convex URL when deployed:

```tsx
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { getConvexUrlWithFallback } from "@get-convex/self-static-hosting";

// Works both in development (uses VITE_CONVEX_URL) and production (auto-detects)
const convexUrl = getConvexUrlWithFallback(import.meta.env.VITE_CONVEX_URL);
const convex = new ConvexReactClient(convexUrl);
```

## Deployment

```bash
# Make sure you're logged in to Convex
npx convex login

# Deploy to Convex
npm run deploy:static

# Your app is now live at:
# https://your-deployment.convex.site
```

## Security

The upload API uses **internal functions** that can only be called via:
- `npx convex run` (requires Convex CLI authentication)
- Other Convex functions (server-side only)

This means unauthorized users **cannot** upload files to your site, even if they know your Convex URL.

## Configuration Options

### `registerStaticRoutes`

```ts
registerStaticRoutes(http, components.selfStaticHosting, {
  // URL prefix for static files (default: "/")
  pathPrefix: "/app",
  
  // Enable SPA fallback to index.html (default: true)
  spaFallback: true,
});
```

## How It Works

1. **Build Phase**: Your bundler (Vite, etc.) creates optimized files in `dist/`
2. **Upload Phase**: The upload script uses `npx convex run` to:
   - Generate signed upload URLs
   - Upload each file to Convex storage
   - Record file metadata in the component's database
   - Garbage collect files from previous deployments
3. **Serve Phase**: HTTP actions serve files from storage with:
   - Correct Content-Type headers
   - Smart cache control (immutable for hashed assets)
   - SPA fallback for client-side routing

## Example

Check out the [example](./example) directory for a complete working example.

```bash
npm install
npm run dev
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

Apache-2.0
