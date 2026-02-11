# Integration Guide: @convex-dev/self-hosting

A Convex component that enables self-hosting static React/Vite apps using Convex HTTP actions and file storage. No external hosting provider required.

## Quick Start

### Step 1: Install
```bash
npm install @convex-dev/self-hosting
```

### Step 2: Setup (Choose One)

#### Option A: Automated Setup (Recommended)
```bash
npx @convex-dev/self-hosting setup
```
Interactive wizard that creates all necessary files.

#### Option B: Manual Setup
See Manual Setup section below.

## Manual Setup

### Required Files

#### 1. convex/convex.config.ts
```typescript
import { defineApp } from "convex/server";
import selfHosting from "@convex-dev/self-hosting/convex.config";

const app = defineApp();
app.use(selfHosting);

export default app;
```

#### 2. convex/staticHosting.ts
```typescript
import { components } from "./_generated/api";
import {
  exposeUploadApi,
  exposeDeploymentQuery,
} from "@convex-dev/self-hosting";

// Internal functions for secure uploads (CLI only)
export const { generateUploadUrl, recordAsset, gcOldAssets, listAssets } =
  exposeUploadApi(components.selfHosting);

// Public query for live reload notifications
export const { getCurrentDeployment } =
  exposeDeploymentQuery(components.selfHosting);
```

#### 3. convex/http.ts
```typescript
import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/self-hosting";
import { components } from "./_generated/api";

const http = httpRouter();

// Serve static files at root with SPA fallback
registerStaticRoutes(http, components.selfHosting);

// Or serve at a path prefix (recommended if you have API routes):
// registerStaticRoutes(http, components.selfHosting, {
//   pathPrefix: "/app",
//   spaFallback: true,
// });

export default http;
```

#### 4. package.json Deploy Script
Add a deploy script for easy deployments:

```json
{
  "scripts": {
    "deploy": "npx @convex-dev/self-hosting deploy"
  }
}
```

## Common Commands

```bash
# Interactive setup wizard
npx @convex-dev/self-hosting setup

# One-shot deployment (backend + static files)
npx @convex-dev/self-hosting deploy

# Upload static files only (after building)
npx @convex-dev/self-hosting upload --build --prod

# Traditional two-step deployment
npx convex deploy                                      # Deploy backend
npx @convex-dev/self-hosting upload --build --prod  # Deploy static files
```

## Deployment Workflow

### First Time Setup
```bash
# 1. Install
npm install @convex-dev/self-hosting

# 2. Run setup wizard
npx @convex-dev/self-hosting setup

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
import { UpdateBanner } from "@convex-dev/self-hosting/react";
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
import { useDeploymentUpdates } from "@convex-dev/self-hosting/react";
import { api } from "../convex/_generated/api";

const { updateAvailable, reload, dismiss } = useDeploymentUpdates(
  api.staticHosting.getCurrentDeployment
);
```

## Security

Upload functions are **internal** - they can only be called via:
- `npx convex run` (requires Convex CLI authentication)
- Other Convex functions (server-side only)

This means unauthorized users cannot upload files, even if they know your Convex URL.

## Troubleshooting

### Files not updating after deployment
- Clear browser cache or use incognito mode

### Build fails with wrong VITE_CONVEX_URL
Always use the `--build` flag when deploying:
```bash
# ✅ Correct - CLI sets VITE_CONVEX_URL for target environment
npx @convex-dev/self-hosting deploy

# ❌ Wrong - uses dev URL from .env.local
npm run build && npx @convex-dev/self-hosting upload --prod
```

### "Cannot find module convex.config"
Make sure you've installed the package and it's listed in `package.json`:
```bash
npm install @convex-dev/self-hosting
```

### HTTP routes not working (404s)
- You must create `convex/http.ts` and register routes
- Run `npx convex dev` to regenerate types after adding http.ts

### Component name mismatch
Default component name is `staticHosting`. If you named your file differently or used a different component name in config, specify it:
```bash
npx @convex-dev/self-hosting upload --component myCustomName
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
import { getConvexUrl } from "@convex-dev/self-hosting";

const convexUrl = import.meta.env.VITE_CONVEX_URL ?? getConvexUrl();
```

## Additional Resources

- [README.md](./README.md) - Full documentation with advanced features
- [Example app](./example) - Working example implementation
- [Component source](./src/component) - Component internals
