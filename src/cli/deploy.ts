#!/usr/bin/env node
/**
 * One-shot deployment command that deploys both Convex backend and static files.
 *
 * Usage:
 *   npx @convex-dev/self-hosting deploy [options]
 *
 * This command:
 * 1. Builds the frontend with the correct VITE_CONVEX_URL
 * 2. Deploys the Convex backend (npx convex deploy)
 * 3. Deploys static files to Convex storage
 *
 * The goal is to minimize the inconsistency window between backend and frontend.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { execSync, spawnSync } from "child_process";

interface ParsedArgs {
  dist: string;
  component: string;
  help: boolean;
  skipBuild: boolean;
  skipConvex: boolean;
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    dist: "./dist",
    component: "staticHosting",
    help: false,
    skipBuild: false,
    skipConvex: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--dist" || arg === "-d") {
      result.dist = args[++i] || result.dist;
    } else if (arg === "--component" || arg === "-c") {
      result.component = args[++i] || result.component;
    } else if (arg === "--skip-build") {
      result.skipBuild = true;
    } else if (arg === "--skip-convex") {
      result.skipConvex = true;
    }
  }

  return result;
}

function showHelp(): void {
  console.log(`
Usage: npx @convex-dev/self-hosting deploy [options]

One-shot deployment: builds frontend, deploys Convex backend, then deploys static files.
Minimizes the inconsistency window between backend and frontend updates.

Options:
  -d, --dist <path>           Path to dist directory (default: ./dist)
  -c, --component <name>      Convex component name (default: staticHosting)
      --skip-build            Skip the build step (use existing dist)
      --skip-convex           Skip Convex backend deployment
  -h, --help                  Show this help message

Deployment Flow:
  1. Build frontend with production VITE_CONVEX_URL
  2. Deploy Convex backend (npx convex deploy)
  3. Deploy static files to Convex storage

Examples:
  # Full deployment
  npx @convex-dev/self-hosting deploy

  # Skip build (if already built)
  npx @convex-dev/self-hosting deploy --skip-build

  # Only deploy static files (skip Convex backend)
  npx @convex-dev/self-hosting deploy --skip-convex
`);
}

/**
 * Get the production Convex URL
 */
function getConvexProdUrl(): string | null {
  try {
    const result = execSync("npx convex env get CONVEX_CLOUD_URL --prod", {
      stdio: "pipe",
      encoding: "utf-8",
    });
    return result.trim() || null;
  } catch {
    // Fall back to env files
  }

  // Try env files as fallback
  const envFiles = [".env.production", ".env.production.local", ".env.local"];
  for (const envFile of envFiles) {
    if (existsSync(envFile)) {
      const content = readFileSync(envFile, "utf-8");
      const match = content.match(/(?:VITE_)?CONVEX_URL=(.+)/);
      if (match) {
        return match[1].trim();
      }
    }
  }

  return null;
}

/**
 * Run the Convex storage upload flow
 */
async function uploadToConvexStorage(
  distDir: string,
  componentName: string,
): Promise<boolean> {
  console.log("");
  console.log("📦 Uploading static files to Convex storage...");
  console.log("");

  const result = spawnSync(
    "npx",
    [
      "@convex-dev/self-hosting",
      "upload",
      "--dist",
      distDir,
      "--component",
      componentName,
      "--prod",
    ],
    { stdio: "inherit" },
  );

  return result.status === 0;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  console.log("");
  console.log("🚀 Convex + Static Files Deployment");
  console.log("═══════════════════════════════════════════════════════════");

  const startTime = Date.now();

  // Step 1: Get production Convex URL (needed for build)
  console.log("");
  console.log("Step 1: Getting production Convex URL...");

  let convexUrl = getConvexProdUrl();

  if (!convexUrl && !args.skipConvex) {
    console.log("   No production deployment found. Will get URL after deploying backend.");
  } else if (convexUrl) {
    console.log(`   ✓ ${convexUrl}`);
  }

  // Step 2: Build frontend
  if (!args.skipBuild) {
    console.log("");
    console.log("Step 2: Building frontend...");

    // If we don't have a URL yet, we need to deploy Convex first to get it
    if (!convexUrl && !args.skipConvex) {
      console.log("   Deploying Convex backend first to get production URL...");
      console.log("");

      const convexResult = spawnSync("npx", ["convex", "deploy"], {
        stdio: "inherit",
      });

      if (convexResult.status !== 0) {
        console.error("");
        console.error("❌ Convex deployment failed");
        process.exit(1);
      }

      // Now get the URL
      convexUrl = getConvexProdUrl();
      if (!convexUrl) {
        console.error("");
        console.error("❌ Could not get production Convex URL after deployment");
        process.exit(1);
      }
      console.log("");
      console.log(`   ✓ Production URL: ${convexUrl}`);
      args.skipConvex = true; // Already deployed
    }

    if (!convexUrl) {
      console.error("");
      console.error("❌ Could not determine Convex URL for build");
      console.error("   Run 'npx convex deploy' first or remove --skip-convex");
      process.exit(1);
    }

    console.log(`   Building with VITE_CONVEX_URL=${convexUrl}`);
    console.log("");

    const buildResult = spawnSync("npm", ["run", "build"], {
      stdio: "inherit",
      env: { ...process.env, VITE_CONVEX_URL: convexUrl },
    });

    if (buildResult.status !== 0) {
      console.error("");
      console.error("❌ Build failed");
      process.exit(1);
    }

    console.log("");
    console.log("   ✓ Build complete");
  } else {
    console.log("");
    console.log("Step 2: Skipping build (--skip-build)");
  }

  // Step 3: Deploy Convex backend
  if (!args.skipConvex) {
    console.log("");
    console.log("Step 3: Deploying Convex backend...");
    console.log("");

    const convexResult = spawnSync("npx", ["convex", "deploy"], {
      stdio: "inherit",
    });

    if (convexResult.status !== 0) {
      console.error("");
      console.error("❌ Convex deployment failed");
      process.exit(1);
    }

    console.log("");
    console.log("   ✓ Convex backend deployed");
  } else {
    console.log("");
    console.log("Step 3: Skipping Convex deployment (--skip-convex or already deployed)");
  }

  // Step 4: Deploy static files
  console.log("");
  console.log("Step 4: Deploying static files to Convex storage...");

  const distDir = resolve(args.dist);

  if (!existsSync(distDir)) {
    console.error("");
    console.error(`❌ Dist directory not found: ${distDir}`);
    console.error("   Run build first or check --dist path");
    process.exit(1);
  }

  const staticDeploySuccess = await uploadToConvexStorage(distDir, args.component);

  if (!staticDeploySuccess) {
    console.error("");
    console.error("❌ Static file upload failed");
    process.exit(1);
  }

  // Done!
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`✨ Deployment complete! (${duration}s)`);
  console.log("");

  // Show Convex site URL
  try {
    const result = execSync("npx convex env get CONVEX_CLOUD_URL --prod", {
      stdio: "pipe",
      encoding: "utf-8",
    });
    const cloudUrl = result.trim();
    if (cloudUrl && cloudUrl.includes(".convex.cloud")) {
      const siteUrl = cloudUrl.replace(".convex.cloud", ".convex.site");
      console.log(`Frontend: ${siteUrl}`);
    }
  } catch {
    // Ignore
  }

  console.log("");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exit(1);
});
