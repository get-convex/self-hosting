#!/usr/bin/env node
/**
 * CLI tool to upload static files to Convex storage.
 *
 * Usage:
 *   npx @get-convex/self-static-hosting upload [options]
 *
 * Options:
 *   --dist <path>      Path to dist directory (default: ./dist)
 *   --module <name>    Convex module with upload functions (default: staticHosting)
 *   --help             Show help
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, relative, extname, resolve } from "path";
import { randomUUID } from "crypto";
import { execSync } from "child_process";

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
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml",
};

function getMimeType(path: string): string {
  return MIME_TYPES[extname(path).toLowerCase()] || "application/octet-stream";
}

function parseArgs(args: string[]): {
  dist: string;
  module: string;
  help: boolean;
} {
  const result = {
    dist: "./dist",
    module: "staticHosting",
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--dist" || arg === "-d") {
      result.dist = args[++i] || result.dist;
    } else if (arg === "--module" || arg === "-m") {
      result.module = args[++i] || result.module;
    }
  }

  return result;
}

function showHelp(): void {
  console.log(`
Usage: npx @get-convex/self-static-hosting upload [options]

Upload static files from a dist directory to Convex storage.

Options:
  -d, --dist <path>     Path to dist directory (default: ./dist)
  -m, --module <name>   Convex module with upload functions (default: staticHosting)
  -h, --help            Show this help message

Examples:
  npx @get-convex/self-static-hosting upload
  npx @get-convex/self-static-hosting upload --dist ./build
  npx @get-convex/self-static-hosting upload --module myStaticHosting

Setup:
  1. Create a Convex module that exposes the upload API:

     // convex/staticHosting.ts
     import { exposeUploadApi } from "@get-convex/self-static-hosting";
     import { components } from "./_generated/api";

     export const { generateUploadUrl, recordAsset, gcOldAssets, listAssets } =
       exposeUploadApi(components.selfStaticHosting);

  2. Run the upload command after building your app:

     npm run build
     npx @get-convex/self-static-hosting upload
`);
}

function convexRun(
  functionPath: string,
  args: Record<string, unknown> = {},
): string {
  const argsJson = JSON.stringify(args);
  const cmd = `npx convex run "${functionPath}" '${argsJson}' --typecheck=disable --codegen=disable`;
  try {
    const result = execSync(cmd, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim();
  } catch (error) {
    const execError = error as { stderr?: string; stdout?: string };
    console.error("Convex run failed:", execError.stderr || execError.stdout);
    throw error;
  }
}

function collectFiles(
  dir: string,
  baseDir: string,
): Array<{ path: string; localPath: string; contentType: string }> {
  const files: Array<{
    path: string;
    localPath: string;
    contentType: string;
  }> = [];

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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  const distDir = resolve(args.dist);
  const moduleName = args.module;

  if (!existsSync(distDir)) {
    console.error(`Error: dist directory not found: ${distDir}`);
    console.error("Run your build command first (e.g., 'npm run build')");
    process.exit(1);
  }

  const deploymentId = randomUUID();
  const files = collectFiles(distDir, distDir);

  console.log("🔒 Using secure internal functions (requires Convex CLI auth)");
  console.log(
    `Uploading ${files.length} files with deployment ID: ${deploymentId}`,
  );
  console.log(`Module: ${moduleName}`);
  console.log("");

  for (const file of files) {
    const content = readFileSync(file.localPath);

    // Get upload URL via internal function
    const uploadUrlOutput = convexRun(`${moduleName}:generateUploadUrl`);
    const uploadUrl = JSON.parse(uploadUrlOutput);

    // Upload to storage
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.contentType },
      body: content,
    });

    const { storageId } = (await response.json()) as { storageId: string };

    // Record in database via internal function
    convexRun(`${moduleName}:recordAsset`, {
      path: file.path,
      storageId,
      contentType: file.contentType,
      deploymentId,
    });

    console.log(`  ✓ ${file.path} (${file.contentType})`);
  }

  console.log("");

  // Garbage collect old files
  const deletedOutput = convexRun(`${moduleName}:gcOldAssets`, {
    currentDeploymentId: deploymentId,
  });
  const deleted = JSON.parse(deletedOutput);

  if (deleted > 0) {
    console.log(`Cleaned up ${deleted} old file(s) from previous deployments`);
  }

  // Optional: Purge Cloudflare cache if configured
  const cloudflareZoneId = process.env.CLOUDFLARE_ZONE_ID;
  const cloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (cloudflareZoneId && cloudflareApiToken) {
    console.log("");
    console.log("☁️  Purging Cloudflare cache...");
    try {
      convexRun(`${moduleName}:purgeCloudflareCache`, {
        zoneId: cloudflareZoneId,
        apiToken: cloudflareApiToken,
        purgeAll: true,
      });
      console.log("   Cache purged successfully");
    } catch {
      console.warn("   Warning: Cloudflare cache purge failed (function may not be exposed)");
    }
  }

  console.log("");
  console.log("✨ Upload complete!");

  // Try to show the deployment URL
  if (existsSync(".env.local")) {
    const envContent = readFileSync(".env.local", "utf-8");
    const match = envContent.match(/(?:VITE_)?CONVEX_URL=(.+)/);
    if (match) {
      const convexUrl = match[1].trim();
      console.log("");
      console.log(
        `Your app is now available at: ${convexUrl.replace(".convex.cloud", ".convex.site")}`,
      );
    }
  }

  if (!cloudflareZoneId || !cloudflareApiToken) {
    console.log("");
    console.log(
      "💡 Tip: Set CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN to enable CDN cache purging",
    );
  }
}

main().catch((error) => {
  console.error("Upload failed:", error);
  process.exit(1);
});
