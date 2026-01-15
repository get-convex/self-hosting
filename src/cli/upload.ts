#!/usr/bin/env node
/**
 * CLI tool to upload static files to Convex storage.
 *
 * Usage:
 *   npx @get-convex/self-static-hosting upload [options]
 *
 * Options:
 *   --dist <path>       Path to dist directory (default: ./dist)
 *   --module <name>     Convex module with upload functions (default: staticHosting)
 *   --domain <domain>   Domain for Cloudflare cache purge (auto-detects zone ID)
 *   --help              Show help
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, relative, extname, resolve } from "path";
import { randomUUID } from "crypto";
import { execSync } from "child_process";
import { homedir } from "os";

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

interface ParsedArgs {
  dist: string;
  module: string;
  domain: string | null;
  help: boolean;
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    dist: "./dist",
    module: "staticHosting",
    domain: null,
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
    } else if (arg === "--domain") {
      result.domain = args[++i] || null;
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
      --domain <name>   Domain for Cloudflare cache purge (e.g., example.com)
  -h, --help            Show this help message

Cloudflare Cache Purging:
  The CLI will automatically purge Cloudflare cache if credentials are available.
  
  Option 1: Use --domain flag (auto-detects zone ID)
    Requires wrangler login or CLOUDFLARE_API_TOKEN env var
    
    npx @get-convex/self-static-hosting upload --domain mysite.com
  
  Option 2: Set environment variables (for CI/CD)
    export CLOUDFLARE_ZONE_ID="your-zone-id"
    export CLOUDFLARE_API_TOKEN="your-api-token"
    npx @get-convex/self-static-hosting upload

Examples:
  npx @get-convex/self-static-hosting upload
  npx @get-convex/self-static-hosting upload --dist ./build
  npx @get-convex/self-static-hosting upload --domain mysite.com
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

/**
 * Try to get Cloudflare API token from various sources:
 * 1. CLOUDFLARE_API_TOKEN environment variable
 * 2. Wrangler config file (~/.wrangler/config/default.toml)
 */
function getCloudflareApiToken(): string | null {
  // Check environment variable first
  if (process.env.CLOUDFLARE_API_TOKEN) {
    return process.env.CLOUDFLARE_API_TOKEN;
  }

  // Try to read from wrangler config
  const wranglerConfigPath = join(
    homedir(),
    ".wrangler",
    "config",
    "default.toml",
  );
  if (existsSync(wranglerConfigPath)) {
    try {
      const config = readFileSync(wranglerConfigPath, "utf-8");
      // Look for oauth_token in the TOML file
      const tokenMatch = config.match(/oauth_token\s*=\s*"([^"]+)"/);
      if (tokenMatch) {
        return tokenMatch[1];
      }
    } catch {
      // Ignore read errors
    }
  }

  return null;
}

/**
 * Look up Cloudflare zone ID for a domain using the API
 */
async function getCloudflareZoneId(
  domain: string,
  apiToken: string,
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(domain)}`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    const data = (await response.json()) as {
      success: boolean;
      result: Array<{ id: string; name: string }>;
    };

    if (data.success && data.result.length > 0) {
      return data.result[0].id;
    }

    // Try parent domain if subdomain didn't match
    const parts = domain.split(".");
    if (parts.length > 2) {
      const parentDomain = parts.slice(-2).join(".");
      const parentResponse = await fetch(
        `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(parentDomain)}`,
        {
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
        },
      );
      const parentData = (await parentResponse.json()) as {
        success: boolean;
        result: Array<{ id: string; name: string }>;
      };
      if (parentData.success && parentData.result.length > 0) {
        return parentData.result[0].id;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Purge Cloudflare cache using the API directly
 */
async function purgeCloudflareCache(
  zoneId: string,
  apiToken: string,
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ purge_everything: true }),
      },
    );

    const data = (await response.json()) as { success: boolean };
    return data.success;
  } catch {
    return false;
  }
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

  // Cloudflare cache purging
  let cachePurged = false;
  const cloudflareZoneId = process.env.CLOUDFLARE_ZONE_ID;
  const cloudflareApiToken = getCloudflareApiToken();

  // Option 1: Use --domain flag with auto-detected credentials
  if (args.domain && cloudflareApiToken) {
    console.log("");
    console.log(`☁️  Purging Cloudflare cache for ${args.domain}...`);

    const zoneId = await getCloudflareZoneId(args.domain, cloudflareApiToken);
    if (zoneId) {
      const success = await purgeCloudflareCache(zoneId, cloudflareApiToken);
      if (success) {
        console.log("   Cache purged successfully");
        cachePurged = true;
      } else {
        console.warn("   Warning: Cache purge failed");
      }
    } else {
      console.warn(`   Warning: Could not find zone for domain ${args.domain}`);
      console.warn("   Make sure the domain is in your Cloudflare account");
    }
  }
  // Option 2: Use explicit env vars (for CI/CD)
  else if (cloudflareZoneId && cloudflareApiToken && !cachePurged) {
    console.log("");
    console.log("☁️  Purging Cloudflare cache...");
    try {
      // Use Convex function (useful for CI/CD where you might want logging)
      convexRun(`${moduleName}:purgeCloudflareCache`, {
        zoneId: cloudflareZoneId,
        apiToken: cloudflareApiToken,
        purgeAll: true,
      });
      console.log("   Cache purged successfully");
      cachePurged = true;
    } catch {
      // Fall back to direct API call
      const success = await purgeCloudflareCache(
        cloudflareZoneId,
        cloudflareApiToken,
      );
      if (success) {
        console.log("   Cache purged successfully (direct API)");
        cachePurged = true;
      } else {
        console.warn("   Warning: Cloudflare cache purge failed");
      }
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

  if (!cachePurged && !args.domain) {
    console.log("");
    console.log("💡 Tip: Add --domain yoursite.com to auto-purge Cloudflare cache");
    console.log("   (requires 'npx wrangler login' or CLOUDFLARE_API_TOKEN)");
  }
}

main().catch((error) => {
  console.error("Upload failed:", error);
  process.exit(1);
});
