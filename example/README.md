# Static Hosting Example

This example demonstrates how to use the `@convex-dev/self-hosting` component to host a React/Vite app directly on Convex.

## Running the Example

From the root of the repository:

```bash
# Install dependencies and start dev server
npm install
npm run dev
```

This starts:
- The Convex backend development server
- The Vite frontend development server
- A file watcher for rebuilding the component

## Deploying Static Files

Once you have a Convex deployment, you can deploy your static files:

```bash
# Build the example app and upload to Convex
cd example
CONVEX_URL=https://your-deployment.convex.cloud npx tsx scripts/upload-static.ts
```

Your app will then be available at `https://your-deployment.convex.site`.

## Files

- `convex/convex.config.ts` - Imports and uses the static hosting component
- `convex/staticHosting.ts` - Exposes upload API functions
- `convex/http.ts` - Registers static file serving routes
- `scripts/upload-static.ts` - Script to upload built files to Convex
- `src/` - Example React application

## How It Works

1. The component stores static files in Convex file storage
2. HTTP routes serve files with proper Content-Type and caching headers
3. SPA fallback ensures client-side routing works correctly
4. Each deployment gets a unique ID for atomic updates and garbage collection
