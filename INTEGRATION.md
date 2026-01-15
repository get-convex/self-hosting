# Integration Guide: @get-convex/self-static-hosting

A Convex component that enables self-hosting static React/Vite apps using Convex HTTP actions and file storage or Cloudflare Pages. No external hosting provider required for basic setup.

## Quick Start

### Step 1: Install
```bash
npm install @get-convex/self-static-hosting
```

### Step 2: Setup (Choose One)

#### Option A: Automated Setup (Recommended)
```bash
npx @get-convex/self-static-hosting setup
```
Interactive wizard that creates all necessary files and configures your deployment mode.

#### Option B: Manual Setup
See Manual Setup section below.

## Deployment Modes

Choose the mode that best fits your needs:

| Mode | Storage | CDN | Best For | Setup Complexity |
|------|---------|-----|----------|------------------|
| **Cloudflare Pages** | Cloudflare Edge | Built-in | Production apps, best performance | Medium |
| **Convex Storage** | Convex | None | Simple apps, dev/testing | Low |
| **Convex + CF CDN** | Convex | Cloudflare | Custom domain with caching | High |

### Mode 1: Cloudflare Pages (Recommended for Production)

**When to use**: You want the best performance with files served from Cloudflare's edge network.

**Pros**: No Convex storage costs for static files, automatic SSL, edge caching, built-in SPA routing

**Files needed**:
- `convex/convex.config.ts` - Register component
- `convex/staticHosting.ts` - Deployment tracking

**Deploy command**:
```bash
npm run deploy  # One-shot: builds + deploys backend + deploys to CF Pages
```

**Setup**:
```bash
npx @get-convex/self-static-hosting setup
# Select "Cloudflare Pages" when prompted
```

### Mode 2: Convex Storage (Simplest)

**When to use**: You want the simplest setup with no external dependencies.

**Pros**: Simple, all in Convex, no additional accounts needed

**Cons**: Storage costs for static files, files served from Convex backend

**Files needed**:
- `convex/convex.config.ts` - Register component
- `convex/http.ts` - HTTP routes to serve files
- `convex/staticHosting.ts` - Upload API

**Deploy command**:
```bash
npm run deploy  # One-shot: builds + deploys backend + uploads to Convex
```

**Setup**:
```bash
npx @get-convex/self-static-hosting setup
# Select "Convex Storage" when prompted
```

### Mode 3: Convex Storage + Cloudflare CDN (Advanced)

**When to use**: You want files in Convex but with Cloudflare caching and custom domain.

**Pros**: Custom domain, DDoS protection, edge caching

**Cons**: More complex setup, requires Cloudflare Worker for Host header rewriting

**Files needed**: Same as Mode 2 + Cloudflare configuration

**Setup**:
```bash
npx @get-convex/self-static-hosting setup
# Select "Convex Storage + Cloudflare CDN" when prompted
```

## Manual Setup

### Required Files

#### 1. convex/convex.config.ts
```typescript
import { defineApp } from "convex/server";
import selfStaticHosting from "@get-convex/self-static-hosting/convex.config";

const app = defineApp();
app.use(selfStaticHosting);

export default app;
```

#### 2. convex/staticHosting.ts
```typescript
import { components } from "./_generated/api";
import {
  exposeUploadApi,
  exposeDeploymentQuery,
} from "@get-convex/self-static-hosting";

// Internal functions for secure uploads (CLI only)
export const { generateUploadUrl, recordAsset, gcOldAssets, listAssets } =
  exposeUploadApi(components.selfStaticHosting);

// Public query for live reload notifications
export const { getCurrentDeployment } =
  exposeDeploymentQuery(components.selfStaticHosting);
```

### Optional Files (Convex Storage Mode Only)

#### 3. convex/http.ts (Required for Convex Storage Mode)
```typescript
import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@get-convex/self-static-hosting";
import { components } from "./_generated/api";

const http = httpRouter();

// Serve static files at root with SPA fallback
registerStaticRoutes(http, components.selfStaticHosting);

// Or serve at a path prefix (recommended if you have API routes):
// registerStaticRoutes(http, components.selfStaticHosting, {
//   pathPrefix: "/app",
//   spaFallback: true,
// });

export default http;
```

#### 4. package.json Deploy Script
Add a deploy script for easy deployments:

For Cloudflare Pages:
```json
{
  "scripts": {
    "deploy": "npx @get-convex/self-static-hosting deploy --cloudflare-pages --pages-project my-app"
  }
}
```

For Convex Storage:
```json
{
  "scripts": {
    "deploy": "npx @get-convex/self-static-hosting deploy"
  }
}
```

## Common Commands

```bash
# Interactive setup wizard
npx @get-convex/self-static-hosting setup

# One-shot deployment (backend + static files)
npx @get-convex/self-static-hosting deploy
npx @get-convex/self-static-hosting deploy --cloudflare-pages --pages-project my-app

# Upload static files only (after building)
npx @get-convex/self-static-hosting upload --build --prod
npx @get-convex/self-static-hosting upload --build --prod --cloudflare-pages

# Traditional two-step deployment
npx convex deploy                                      # Deploy backend
npx @get-convex/self-static-hosting upload --build --prod  # Deploy static files
```

## Deployment Workflow

### First Time Setup
```bash
# 1. Install
npm install @get-convex/self-static-hosting

# 2. Run setup wizard
npx @get-convex/self-static-hosting setup

# 3. Initialize Convex (if not already done)
npx convex dev --once

# 4. Deploy everything
npm run deploy
```

### Subsequent Deployments
```bash
npm run deploy  # That's it!
```

## Live Reload Feature (Optional)

Add a banner that notifies users when a new deployment is available:

```typescript
// In your src/App.tsx or main component
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
      {/* Rest of your app */}
    </div>
  );
}
```

Or use the hook for custom UI:
```typescript
import { useDeploymentUpdates } from "@get-convex/self-static-hosting/react";
import { api } from "../convex/_generated/api";

const { updateAvailable, reload, dismiss } = useDeploymentUpdates(
  api.staticHosting.getCurrentDeployment
);
```

## Environment Variables

### Cloudflare Pages (Optional)
```bash
# .env.local
CLOUDFLARE_PAGES_PROJECT=my-app  # Auto-detected by CLI
```

### Cloudflare CDN Cache Purging (Optional)
```bash
# .env.local
CLOUDFLARE_ZONE_ID=your-zone-id
CLOUDFLARE_API_TOKEN=your-api-token
```

## Security

Upload functions are **internal** - they can only be called via:
- `npx convex run` (requires Convex CLI authentication)
- Other Convex functions (server-side only)

This means unauthorized users cannot upload files, even if they know your Convex URL.

## Troubleshooting

### Files not updating after deployment
- **Cloudflare Pages**: Deployments may take 30-60s to propagate
- **Convex Storage**: Clear browser cache or use incognito mode
- **Cloudflare CDN**: Cache may need manual purge (CLI auto-purges if credentials set)

### Build fails with wrong VITE_CONVEX_URL
Always use the `--build` flag when deploying:
```bash
# ✅ Correct - CLI sets VITE_CONVEX_URL for target environment
npx @get-convex/self-static-hosting deploy

# ❌ Wrong - uses dev URL from .env.local
npm run build && npx @get-convex/self-static-hosting upload --prod
```

### "Cannot find module convex.config"
Make sure you've installed the package and it's listed in `package.json`:
```bash
npm install @get-convex/self-static-hosting
```

### HTTP routes not working (404s)
- **Cloudflare Pages**: You don't need `convex/http.ts`
- **Convex Storage**: You must create `convex/http.ts` and register routes
- Run `npx convex dev` to regenerate types after adding http.ts

### Component name mismatch
Default component name is `staticHosting`. If you named your file differently or used a different component name in config, specify it:
```bash
npx @get-convex/self-static-hosting upload --component myCustomName
```

## API Reference

### registerStaticRoutes(http, component, options?)
Registers HTTP routes for serving static files.

**Options**:
- `pathPrefix` (string): URL prefix for static files (default: "/")
- `spaFallback` (boolean): Enable SPA fallback to index.html (default: true)

### exposeUploadApi(component)
Exposes internal functions for CLI-based uploads.

**Returns**: `{ generateUploadUrl, recordAsset, gcOldAssets, listAssets }`

### exposeDeploymentQuery(component)
Exposes a query for live reload notifications.

**Returns**: `{ getCurrentDeployment }`

### getConvexUrl()
Browser-only function to derive Convex URL from `.convex.site` hostname.

**Usage**:
```typescript
import { getConvexUrl } from "@get-convex/self-static-hosting";

const convexUrl = import.meta.env.VITE_CONVEX_URL ?? getConvexUrl();
```

## Additional Resources

- [README.md](./README.md) - Full documentation with advanced features
- [Example app](./example) - Working example implementation
- [Component source](./src/component) - Component internals
