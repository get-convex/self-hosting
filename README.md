# Convex Self Hosting

[![npm version](https://badge.fury.io/js/@get-convex%2Fself-hosting.svg)](https://badge.fury.io/js/@convex-dev/self-hosting)

A Convex component that enables self-hosting static React/Vite apps using Convex
HTTP actions and file storage. No external hosting provider required!

## Quick Start

### Automated Setup (Recommended)

```bash
npm install @convex-dev/self-hosting
npx @convex-dev/self-hosting setup
```

The interactive wizard will:
1. Create necessary Convex files
2. Add deploy script to package.json

Then deploy:
```bash
npm run deploy
```

### For LLMs / AI Assistants

If you're an LLM helping a user integrate this component, read [INTEGRATION.md](./INTEGRATION.md) for complete integration instructions optimized for AI consumption.

### Manual Setup

See [Manual Setup](#manual-setup-1) section below for step-by-step instructions.

## Features

- 🚀 **Simple deployment** - Upload your built files directly to Convex storage
- 🔒 **Secure by default** - Upload API uses internal functions (not publicly
  accessible)
- 🔄 **SPA support** - Automatic fallback to index.html for client-side routing
- ⚡ **Smart caching** - Hashed assets get long-term caching, HTML is always
  fresh with ETag support
- 🧹 **Auto cleanup** - Old deployment files are automatically garbage collected
- 📦 **Zero config** - Works out of the box with Vite, Create React App, and
  other bundlers



https://github.com/user-attachments/assets/5eaf781f-87da-4292-9f96-38070c86cd39




## Manual Setup

### 1. Install

```bash
npm install @convex-dev/self-hosting
```

### 2. Add to your `convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import selfHosting from "@convex-dev/self-hosting/convex.config.js";

const app = defineApp();
app.use(selfHosting);

export default app;
```

### 3. Register HTTP routes

Create or update `convex/http.ts` to serve static files:

```ts
import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/self-hosting";
import { components } from "./_generated/api";

const http = httpRouter();

// Serve static files at the root path with SPA fallback
registerStaticRoutes(http, components.selfHosting);

export default http;
```

### 4. Expose upload API (internal functions)

Create a file like `convex/staticHosting.ts`:

```ts
import { exposeUploadApi } from "@convex-dev/self-hosting";
import { components } from "./_generated/api";

// These are INTERNAL functions - only callable via `npx convex run`
// NOT accessible from the public internet
export const { generateUploadUrl, recordAsset, gcOldAssets, listAssets } =
  exposeUploadApi(components.selfHosting);
```

**Note:** Run `npx convex dev` at least once after setup to push your schema and
enable HTTP actions. If you see the error "This Convex deployment does not have
HTTP actions enabled", it means the Convex backend hasn't been deployed yet.

### 5. Add deploy script to package.json

```json
{
  "scripts": {
    "build": "vite build",
    "deploy:static": "npx @convex-dev/self-hosting upload --build --prod"
  }
}
```

**Important:** Use `--build` to ensure `VITE_CONVEX_URL` is set correctly for
production. Don't run `npm run build` separately before the upload command, as
that would use the dev URL from `.env.local`.

**CLI Options:**

```bash
npx @convex-dev/self-hosting upload [options]

Options:
  -d, --dist <path>           Path to dist directory (default: ./dist)
  -c, --component <name>      Convex component name (default: staticHosting)
      --prod                  Deploy to production Convex deployment
      --dev                   Deploy to dev deployment (default)
  -b, --build                 Run 'npm run build' with correct VITE_CONVEX_URL
  -h, --help                  Show help
```

**Examples:**

```bash
# Deploy to production with automatic build
npx @convex-dev/self-hosting upload --build --prod

# Deploy to dev (for testing)
npx @convex-dev/self-hosting upload --build
```

### Using Non-Vite Bundlers

The CLI's `--build` flag sets `VITE_CONVEX_URL` when running your build command.
For bundlers that use different environment variable conventions, wrap your build
script to pass through the value:

**For Expo:**

```json
{
  "scripts": {
    "build": "EXPO_PUBLIC_CONVEX_URL=${VITE_CONVEX_URL:-$EXPO_PUBLIC_CONVEX_URL} npx expo export --platform web"
  }
}
```

**For Next.js:**

```json
{
  "scripts": {
    "build": "NEXT_PUBLIC_CONVEX_URL=${VITE_CONVEX_URL:-$NEXT_PUBLIC_CONVEX_URL} next build"
  }
}
```

The pattern `${VITE_CONVEX_URL:-$VAR}` uses `VITE_CONVEX_URL` if set (by the CLI),
otherwise falls back to your bundler-specific variable. This allows the CLI's
`--build` flag to work correctly while keeping your standalone `npm run build`
functional.

## Deployment

### One-Shot Deployment (Recommended)

Deploy both Convex backend and static files with a single command:

```bash
# Make sure you're logged in
npx convex login

# Deploy everything
npx @convex-dev/self-hosting deploy
```

The `deploy` command:
1. Builds frontend with production `VITE_CONVEX_URL`
2. Deploys Convex backend (`npx convex deploy`)
3. Deploys static files to Convex storage

This minimizes the inconsistency window between backend and frontend updates.

**Deploy command options:**

```bash
npx @convex-dev/self-hosting deploy [options]

Options:
  -d, --dist <path>           Path to dist directory (default: ./dist)
  -c, --component <name>      Convex component name (default: staticHosting)
      --skip-build            Skip the build step (use existing dist)
      --skip-convex           Skip Convex backend deployment
  -h, --help                  Show help
```

Add to `package.json` for easy deployments:

```json
{
  "scripts": {
    "deploy": "npx @convex-dev/self-hosting deploy"
  }
}
```

### Manual Two-Step Deployment

If you prefer more control, deploy separately:

```bash
# Deploy Convex backend
npx convex deploy

# Deploy static files
npx @convex-dev/self-hosting upload --build --prod
```

Your app is now live at `https://your-deployment.convex.site`

## Security

The upload API uses **internal functions** that can only be called via:

- `npx convex run` (requires Convex CLI authentication)
- Other Convex functions (server-side only)

This means unauthorized users **cannot** upload files to your site, even if they
know your Convex URL.

## Live Reload on Deploy

Connected clients can be notified when a new deployment is available:

1. **Expose the deployment query**:

   ```ts
   import { exposeDeploymentQuery } from "@convex-dev/self-hosting";
   import { components } from "./_generated/api";

   export const { getCurrentDeployment } = exposeDeploymentQuery(
     components.selfHosting,
   );
   ```

2. **Add the update banner to your app**:

   ```tsx
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
         {/* rest of your app */}
       </div>
     );
   }
   ```

Or use the hook for custom UI:

```tsx
import { useDeploymentUpdates } from "@convex-dev/self-hosting/react";

const { updateAvailable, reload, dismiss } = useDeploymentUpdates(
  api.staticHosting.getCurrentDeployment,
);
```

## Configuration Options

### `registerStaticRoutes`

```ts
registerStaticRoutes(http, components.selfHosting, {
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
