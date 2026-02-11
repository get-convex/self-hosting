#!/usr/bin/env node
/**
 * CLI tool to upload static files to Convex storage.
 *
 * Usage:
 *   npx @convex-dev/self-hosting upload [options]
 *
 * Options:
 *   --dist <path>            Path to dist directory (default: ./dist)
 *   --component <name>       Convex component with upload functions (default: staticHosting)
 *   --prod                   Deploy to production deployment
 *   --help                   Show help
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, relative, extname, resolve } from "path";
import { randomUUID } from "crypto";
import { execSync, spawnSync } from "child_process";

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
  component: string;
  prod: boolean;
  build: boolean;
  help: boolean;
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    dist: "./dist",
    component: "staticHosting",
    prod: false, // Default to dev, use --prod for production
    build: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--dist" || arg === "-d") {
      result.dist = args[++i] || result.dist;
    } else if (arg === "--component" || arg === "-c") {
      result.component = args[++i] || result.component;
    } else if (arg === "--prod") {
      result.prod = true;
    } else if (arg === "--no-prod" || arg === "--dev") {
      result.prod = false;
    } else if (arg === "--build" || arg === "-b") {
      result.build = true;
    }
  }

  return result;
}

function showHelp(): void {
  console.log(`
Usage: npx @convex-dev/self-hosting upload [options]

Upload static files from a dist directory to Convex storage.

Options:
  -d, --dist <path>           Path to dist directory (default: ./dist)
  -c, --component <name>      Convex component with upload functions (default: staticHosting)
      --prod                  Deploy to production deployment
  -b, --build                 Run 'npm run build' with correct VITE_CONVEX_URL before uploading
  -h, --help                  Show this help message

Examples:
  # Upload to Convex storage
  npx @convex-dev/self-hosting upload
  npx @convex-dev/self-hosting upload --dist ./build --prod
  npx @convex-dev/self-hosting upload --build --prod
`);
}

// Global flag for production mode
let useProd = true;

function convexRun(
  functionPath: string,
  args: Record<string, unknown> = {},
): string {
  const argsJson = JSON.stringify(args);
  const prodFlag = useProd ? "--prod" : "";
  const cmd = `npx convex run "${functionPath}" '${argsJson}' ${prodFlag} --typecheck=disable --codegen=disable`;
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

  // Set global prod flag
  useProd = args.prod;

  // Run build if requested
  if (args.build) {
    let convexUrl: string | null = null;

    if (useProd) {
      // Get production URL from convex dashboard
      try {
        const result = execSync("npx convex dashboard --prod --no-open", {
          stdio: "pipe",
          encoding: "utf-8",
        });
        const match = result.match(/dashboard\.convex\.dev\/d\/([a-z0-9-]+)/i);
        if (match) {
          convexUrl = `https://${match[1]}.convex.cloud`;
        }
      } catch {
        console.error("Could not get production Convex URL.");
        console.error(
          "Make sure you have deployed to production: npx convex deploy",
        );
        process.exit(1);
      }
    } else {
      // Get dev URL from .env.local
      if (existsSync(".env.local")) {
        const envContent = readFileSync(".env.local", "utf-8");
        const match = envContent.match(/(?:VITE_)?CONVEX_URL=(.+)/);
        if (match) {
          convexUrl = match[1].trim();
        }
      }
    }

    if (!convexUrl) {
      console.error("Could not determine Convex URL for build.");
      process.exit(1);
    }

    const envLabel = useProd ? "production" : "development";
    console.log(`🔨 Building for ${envLabel}...`);
    console.log(`   VITE_CONVEX_URL=${convexUrl}`);
    console.log("");

    const buildResult = spawnSync("npm", ["run", "build"], {
      stdio: "inherit",
      env: { ...process.env, VITE_CONVEX_URL: convexUrl },
    });

    if (buildResult.status !== 0) {
      console.error("Build failed.");
      process.exit(1);
    }

    console.log("");
  }

  const distDir = resolve(args.dist);
  const componentName = args.component;

  // Convex storage deployment

  if (!existsSync(distDir)) {
    console.error(`Error: dist directory not found: ${distDir}`);
    console.error(
      "Run your build command first (e.g., 'npm run build' or add --build flag)",
    );
    process.exit(1);
  }

  const deploymentId = randomUUID();
  const files = collectFiles(distDir, distDir);

  const envLabel = useProd ? "production" : "development";
  console.log(`🚀 Deploying to ${envLabel} environment`);
  console.log("🔒 Using secure internal functions (requires Convex CLI auth)");
  console.log(
    `Uploading ${files.length} files with deployment ID: ${deploymentId}`,
  );
  console.log(`Component: ${componentName}`);
  console.log("");

  for (const file of files) {
    const content = readFileSync(file.localPath);

    // Get upload URL via internal function
    const uploadUrlOutput = convexRun(`${componentName}:generateUploadUrl`);
    const uploadUrl = JSON.parse(uploadUrlOutput);

    // Upload to storage
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.contentType },
      body: content,
    });

    const { storageId } = (await response.json()) as { storageId: string };

    // Record in database via internal function
    convexRun(`${componentName}:recordAsset`, {
      path: file.path,
      storageId,
      contentType: file.contentType,
      deploymentId,
    });

    console.log(`  ✓ ${file.path} (${file.contentType})`);
  }

  console.log("");

  // Garbage collect old files
  const deletedOutput = convexRun(`${componentName}:gcOldAssets`, {
    currentDeploymentId: deploymentId,
  });
  const deleted = JSON.parse(deletedOutput);

  if (deleted > 0) {
    console.log(`Cleaned up ${deleted} old file(s) from previous deployments`);
  }

  console.log("");
  console.log("✨ Upload complete!");

  // Show the deployment URL
  const siteUrl = getConvexSiteUrl(useProd);
  if (siteUrl) {
    console.log("");
    console.log(`Your app is now available at: ${siteUrl}`);
  }
}

/**
 * Get the Convex site URL (.convex.site) from the cloud URL
 */
function getConvexSiteUrl(prod: boolean): string | null {
  try {
    const envFlag = prod ? "--prod" : "";
    const result = execSync(`npx convex env get CONVEX_CLOUD_URL ${envFlag}`, {
      stdio: "pipe",
      encoding: "utf-8",
    });
    const cloudUrl = result.trim();
    if (cloudUrl && cloudUrl.includes(".convex.cloud")) {
      return cloudUrl.replace(".convex.cloud", ".convex.site");
    }
  } catch {
    // Ignore errors
  }
  return null;
}

main().catch((error) => {
  console.error("Upload failed:", error);
  process.exit(1);
});
