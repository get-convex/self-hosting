#!/usr/bin/env node
/**
 * CLI tool to build and prepare a Next.js app for Convex deployment.
 *
 * This tool:
 * 1. Runs `next build` (output: standalone)
 * 2. Collects server-side files from the standalone build
 * 3. Generates `convex/_generatedNextServer.ts` with embedded file contents
 * 4. Uploads static assets (.next/static/) to Convex storage
 * 5. Ensures convex.json has node.externalPackages: ["next"]
 *
 * Usage:
 *   npx @convex-dev/self-hosting next-build [options]
 *
 * Options:
 *   --skip-build          Skip running `next build`
 *   --component <name>    Convex component name (default: staticHosting)
 *   --convex-dir <path>   Path to convex/ directory (default: ./convex)
 *   --prod                Upload statics to production deployment
 *   --skip-upload         Skip uploading static files
 *   --help                Show help
 */
export {};
//# sourceMappingURL=next-build.d.ts.map