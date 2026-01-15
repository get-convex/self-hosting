/**
 * Upload static files from the dist/ directory to Convex storage.
 *
 * Usage:
 *   npx tsx scripts/upload-static.ts
 *
 * This script uses `npx convex run` to call INTERNAL functions,
 * which means it requires Convex CLI authentication (not just a URL).
 * This is more secure than exposing public mutations.
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, relative, dirname, extname } from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const exampleDir = join(__dirname, "..");
const repoRoot = join(exampleDir, "..");
const distDir = join(exampleDir, "dist");

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

/**
 * Run a Convex function using the CLI
 */
function convexRun(
  functionPath: string,
  args: Record<string, unknown> = {},
): string {
  const argsJson = JSON.stringify(args);
  const cmd = `npx convex run "${functionPath}" '${argsJson}' --typecheck=disable --codegen=disable`;
  try {
    const result = execSync(cmd, {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    // Parse the output - convex run outputs the result as JSON
    return result.trim();
  } catch (error) {
    const execError = error as { stderr?: string; stdout?: string };
    console.error("Convex run failed:", execError.stderr || execError.stdout);
    throw error;
  }
}

// Recursively collect files
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

async function main() {
  if (!existsSync(distDir)) {
    console.error(
      "Error: dist directory not found. Run 'npm run build' first.",
    );
    process.exit(1);
  }

  const deploymentId = randomUUID();
  const files = collectFiles(distDir, distDir);

  console.log("🔒 Using secure internal functions (requires Convex CLI auth)");
  console.log(
    `Uploading ${files.length} files with deployment ID: ${deploymentId}`,
  );
  console.log("");

  for (const file of files) {
    const content = readFileSync(file.localPath);

    // Get upload URL via internal function
    const uploadUrlOutput = convexRun("example:generateUploadUrl");
    // Parse the JSON string output (convex run returns JSON)
    const uploadUrl = JSON.parse(uploadUrlOutput);

    // Upload to storage (this still uses fetch - it's a signed URL)
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.contentType },
      body: content,
    });

    const { storageId } = (await response.json()) as { storageId: string };

    // Record in database via internal function
    convexRun("example:recordAsset", {
      path: file.path,
      storageId,
      contentType: file.contentType,
      deploymentId,
    });

    console.log(`  ✓ ${file.path} (${file.contentType})`);
  }

  console.log("");

  // Garbage collect old files via internal function
  const deletedOutput = convexRun("example:gcOldAssets", {
    currentDeploymentId: deploymentId,
  });
  const deleted = JSON.parse(deletedOutput);

  if (deleted > 0) {
    console.log(`Cleaned up ${deleted} old file(s) from previous deployments`);
  }

  console.log("");
  console.log("✨ Upload complete!");
  console.log("");

  // Read the deployment URL from .env.local
  const envPath = join(repoRoot, ".env.local");
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf-8");
    const match = envContent.match(/VITE_CONVEX_URL=(.+)/);
    if (match) {
      const convexUrl = match[1].trim();
      console.log(
        `Your app is now available at: ${convexUrl.replace(".convex.cloud", ".convex.site")}`,
      );
    }
  }
}

main().catch((error) => {
  console.error("Upload failed:", error);
  process.exit(1);
});
