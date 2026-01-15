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

## CDN Setup (Cloudflare)

For production deployments, you can put Cloudflare in front of your Convex static site for:
- **Edge caching** - Assets served from 300+ global PoPs
- **Automatic compression** - Brotli/gzip handled by Cloudflare
- **DDoS protection** - Built-in security
- **Custom domains** - Use `yourapp.com` instead of `*.convex.site`

### Cache Behavior

| File Type | Cache-Control | ETag | CDN Behavior |
|-----------|---------------|------|--------------|
| `*.js`, `*.css` (hashed) | `max-age=1yr, immutable` | ✓ | Cached forever, new hash = new URL |
| `index.html` | `must-revalidate` | ✓ | Revalidates with 304 support |
| Images, fonts | `max-age=1yr, immutable` | ✓ | Cached long-term |

### Recommended: Use a Path Prefix

When using Cloudflare, serve static files from a dedicated path (e.g., `/app/`) so your API routes remain unaffected:

```ts
// convex/http.ts
import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@get-convex/self-static-hosting";
import { components } from "./_generated/api";

const http = httpRouter();

// Static files at /app/ - cached aggressively by Cloudflare
registerStaticRoutes(http, components.selfStaticHosting, {
  pathPrefix: "/app",
});

// Your API routes - different cache rules or no caching
http.route({
  path: "/api/webhook",
  method: "POST",
  handler: webhookHandler,
});

export default http;
```

This lets you configure Cloudflare Page Rules separately:
- `/app/*` → Cache Everything, Edge TTL: 1 month
- `/api/*` → Bypass Cache

Your app will be available at `https://yourdomain.com/app/`

### Setting Up Cloudflare

1. **Add your site to Cloudflare** and update your domain's nameservers

2. **Create a CNAME record** pointing to your Convex site:
   ```
   Type: CNAME
   Name: @ (or subdomain)
   Target: your-deployment.convex.site
   Proxy: Enabled (orange cloud)
   ```

3. **Configure SSL** - Set to "Full" in Cloudflare SSL/TLS settings

4. **(Optional) Add Page Rules** for fine-grained cache control:
   - `/app/assets/*` → Cache Level: Cache Everything, Edge TTL: 1 year
   - `/app/*` → Cache Level: Cache Everything, Edge TTL: 1 day

### Optional: Cache Purging

To automatically purge Cloudflare cache on deploy:

1. **Expose the cache purge action** in your `convex/staticHosting.ts`:
   ```ts
   import { exposeCachePurgeAction } from "@get-convex/self-static-hosting";
   
   export const { purgeCloudflareCache } = exposeCachePurgeAction();
   ```

2. **Get your Cloudflare credentials**:
   - Zone ID: Found on your domain's overview page
   - API Token: Create one at Account > API Tokens with "Cache Purge" permission

3. **Set environment variables** before deploying:
   ```bash
   export CLOUDFLARE_ZONE_ID="your-zone-id"
   export CLOUDFLARE_API_TOKEN="your-api-token"
   npm run deploy:static
   ```

The deploy script will automatically purge the cache after uploading new files.

## Live Reload on Deploy

Connected clients can be notified when a new deployment is available:

1. **Expose the deployment query**:
   ```ts
   import { exposeDeploymentQuery } from "@get-convex/self-static-hosting";
   import { components } from "./_generated/api";
   
   export const { getCurrentDeployment } = 
     exposeDeploymentQuery(components.selfStaticHosting);
   ```

2. **Add the update banner to your app**:
   ```tsx
   import { UpdateBanner } from "@get-convex/self-static-hosting/react";
   import { api } from "../convex/_generated/api";
   
   function App() {
     return (
       <div>
         <UpdateBanner
           getCurrentDeployment={api.staticHosting.getCurrentDeployment}
           message="New version available!"
           buttonText="Refresh"
         />
         {/* rest of your app */}
       </div>
     );
   }
   ```

Or use the hook for custom UI:
```tsx
import { useDeploymentUpdates } from "@get-convex/self-static-hosting/react";

const { updateAvailable, reload, dismiss } = useDeploymentUpdates(
  api.staticHosting.getCurrentDeployment
);
```

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
