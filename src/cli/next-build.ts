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

import {
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
  statSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { join, relative, extname, resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { execSync, execFile, spawnSync } from "node:child_process";

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

function getMimeType(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream";
}

// File extensions considered text (embedded as UTF-8 strings)
const TEXT_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".json",
  ".html",
  ".css",
  ".txt",
  ".xml",
  ".rsc",
  ".meta",
  ".map",
]);

// Directories to exclude from server file collection
const EXCLUDED_DIRS = new Set(["static", "cache", "diagnostics", "trace"]);

interface ParsedArgs {
  skipBuild: boolean;
  component: string; // File name for convex run (e.g. "staticHosting")
  componentApi: string; // Component API name from components.xxx (e.g. "selfHosting")
  convexDir: string;
  prod: boolean;
  skipUpload: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    skipBuild: false,
    component: "staticHosting",
    componentApi: "selfHosting",
    convexDir: "./convex",
    prod: false,
    skipUpload: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--skip-build") {
      result.skipBuild = true;
    } else if (arg === "--component" || arg === "-c") {
      result.component = argv[++i] || result.component;
    } else if (arg === "--component-api") {
      result.componentApi = argv[++i] || result.componentApi;
    } else if (arg === "--convex-dir") {
      result.convexDir = argv[++i] || result.convexDir;
    } else if (arg === "--prod") {
      result.prod = true;
    } else if (arg === "--skip-upload") {
      result.skipUpload = true;
    }
  }

  return result;
}

function showHelp(): void {
  console.log(`
Usage: npx @convex-dev/self-hosting next-build [options]

Build a Next.js app and prepare it for Convex deployment.

This command:
  1. Runs \`next build\` (output: standalone)
  2. Embeds server files into a generated Convex action
  3. Uploads static assets to Convex storage
  4. Configures convex.json for Next.js

Options:
      --skip-build          Skip running \`next build\` (use existing .next/)
  -c, --component <name>    Convex component name (default: staticHosting)
      --convex-dir <path>   Path to convex/ directory (default: ./convex)
      --prod                Upload statics to production deployment
      --skip-upload         Skip uploading static files (upload later)
  -h, --help                Show this help message

Examples:
  # Full build and upload
  npx @convex-dev/self-hosting next-build --prod

  # Skip build, just regenerate and upload
  npx @convex-dev/self-hosting next-build --skip-build --prod

  # Generate only, upload later
  npx @convex-dev/self-hosting next-build --skip-upload

After running, deploy your Convex backend:
  npx convex deploy
`);
}

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

interface CollectedFile {
  relativePath: string; // e.g. ".next/BUILD_ID" or "public/favicon.ico"
  content: Buffer;
  isText: boolean;
}

function isTextFile(filePath: string): boolean {
  return TEXT_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function collectFilesRecursive(
  dir: string,
  baseDir: string,
  prefix: string,
  excludeDirs: Set<string>,
  files: CollectedFile[],
): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip excluded directories (only at top level under .next/)
      const relFromBase = relative(baseDir, fullPath);
      const topDir = relFromBase.split("/")[0];
      if (excludeDirs.has(topDir)) continue;

      // Skip .nft.json trace directories
      if (entry.name.endsWith(".nft.json")) continue;

      collectFilesRecursive(fullPath, baseDir, prefix, new Set(), files);
    } else if (entry.isFile()) {
      // Skip .nft.json trace files
      if (entry.name.endsWith(".nft.json")) continue;

      const relPath = prefix + "/" + relative(baseDir, fullPath);
      files.push({
        relativePath: relPath,
        content: readFileSync(fullPath),
        isText: isTextFile(fullPath),
      });
    }
  }
}

function collectBuildFiles(standaloneDir: string): CollectedFile[] {
  const files: CollectedFile[] = [];
  const standaloneDotNext = join(standaloneDir, ".next");

  if (!existsSync(standaloneDotNext)) {
    throw new Error(
      `Standalone build not found at ${standaloneDotNext}.\n` +
        "Make sure your next.config has output: 'standalone'.",
    );
  }

  // Collect server-side files from .next/standalone/.next/
  // (excluding static/, cache/, diagnostics/ and .nft.json files)
  collectFilesRecursive(
    standaloneDotNext,
    standaloneDotNext,
    ".next",
    EXCLUDED_DIRS,
    files,
  );

  // Collect public/ files if they exist
  const publicDir = join(standaloneDir, "public");
  if (existsSync(publicDir)) {
    collectFilesRecursive(publicDir, publicDir, "public", new Set(), files);
  }

  // Add a minimal package.json for the work directory
  files.push({
    relativePath: "package.json",
    content: Buffer.from('{"type":"commonjs"}'),
    isText: true,
  });

  return files;
}

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

function generateServerFile(
  files: CollectedFile[],
  outputPath: string,
  componentApiName: string,
): void {
  const textEntries: string[] = [];
  const binaryEntries: string[] = [];

  for (const file of files) {
    const key = JSON.stringify(file.relativePath);
    if (file.isText) {
      const value = JSON.stringify(file.content.toString("utf-8"));
      textEntries.push(`  ${key}: ${value},`);
    } else {
      const value = JSON.stringify(file.content.toString("base64"));
      binaryEntries.push(`  ${key}: ${value},`);
    }
  }

  // The component API name matches the variable in app.use(selfHosting) → components.selfHosting
  const componentAccessor = `components.${componentApiName}`;

  const code = `"use node";
/* eslint-disable */
/* This file is auto-generated by @convex-dev/self-hosting next-build. Do not edit. */
import { internalActionGeneric } from "convex/server";
import { v } from "convex/values";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { extract as tarExtract } from "tar";
import { toReqRes, toFetchResponse } from "fetch-to-node";
import type { IncomingMessage, ServerResponse } from "node:http";
import { components } from "./_generated/api";

const COMPONENT = ${componentAccessor};

type NodeRequestHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

const WORK_DIR = "/tmp/next-app";
const MODULES_TARBALL_PATH = "/__next_modules__.tar.gz";

const BUILD_FILES: Record<string, string> = {
${textEntries.join("\n")}
};

const BINARY_FILES: Record<string, string> = {
${binaryEntries.join("\n")}
};

let cachedHandler: NodeRequestHandler | null = null;

function ensureAppFilesWritten(): void {
  if (existsSync(join(WORK_DIR, ".next", "BUILD_ID"))) return;
  for (const [relPath, content] of Object.entries(BUILD_FILES)) {
    const fullPath = join(WORK_DIR, relPath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }
  for (const [relPath, b64] of Object.entries(BINARY_FILES)) {
    const fullPath = join(WORK_DIR, relPath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, Buffer.from(b64, "base64"));
  }
}

interface ActionCtx {
  runQuery: (ref: any, args: any) => Promise<any>;
  storage: { get: (id: string) => Promise<Blob | null> };
}

async function ensureModulesExtracted(ctx: ActionCtx, component: any): Promise<void> {
  // Skip if already extracted from a previous invocation
  if (existsSync(join(WORK_DIR, "node_modules", "next", "package.json"))) return;

  const t0 = Date.now();

  // Look up the modules tarball in Convex storage
  const asset = await ctx.runQuery(component.lib.getByPath, {
    path: MODULES_TARBALL_PATH,
  }) as { storageId?: string } | null;

  if (!asset?.storageId) {
    throw new Error(
      "Next.js modules tarball not found in storage. Run: npx @convex-dev/self-hosting next-build",
    );
  }

  const blob = await ctx.storage.get(asset.storageId);
  if (!blob) {
    throw new Error("Failed to download Next.js modules from storage.");
  }

  // Write tarball to disk and extract
  mkdirSync(WORK_DIR, { recursive: true });
  const tarballPath = join(WORK_DIR, "modules.tar.gz");
  writeFileSync(tarballPath, Buffer.from(await blob.arrayBuffer()));
  await tarExtract({ file: tarballPath, cwd: WORK_DIR });

  console.log(\`[next] Extracted modules in \${Date.now() - t0}ms\`);
}

async function bootNextServer(ctx: ActionCtx, component: any): Promise<NodeRequestHandler> {
  const t0 = Date.now();

  // Write embedded app files to /tmp (instant, from memory)
  ensureAppFilesWritten();

  // Download and extract node_modules from Convex storage (cold start only)
  await ensureModulesExtracted(ctx, component);

  const config = JSON.parse(
    BUILD_FILES[".next/required-server-files.json"],
  ).config;

  process.chdir(WORK_DIR);
  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(config);

  // Load NextServer from the extracted node_modules
  const appRequire = createRequire(join(WORK_DIR, "package.json"));
  const NextServer = appRequire("next/dist/server/next-server").default;
  const server = new NextServer({
    dir: WORK_DIR,
    dev: false,
    conf: config,
  });
  await server.prepare();

  console.log(\`[next] NextServer booted in \${Date.now() - t0}ms\`);
  return server.getRequestHandler() as NodeRequestHandler;
}

export const handle = internalActionGeneric({
  args: {
    url: v.string(),
    method: v.string(),
    headers: v.array(v.array(v.string())),
    body: v.optional(v.bytes()),
  },
  returns: v.object({
    status: v.number(),
    headers: v.array(v.array(v.string())),
    body: v.bytes(),
  }),
  handler: async (ctx, args) => {
    if (!cachedHandler) {
      cachedHandler = await bootNextServer(
        ctx as unknown as ActionCtx,
        COMPONENT,
      );
    }

    const hasBody = !["GET", "HEAD"].includes(args.method);
    const request = new Request(args.url, {
      method: args.method,
      headers: args.headers as [string, string][],
      body: hasBody && args.body ? args.body : undefined,
    });

    const { req, res } = toReqRes(request);
    await cachedHandler(req, res);
    if (!res.writableEnded) res.end();
    const response = await toFetchResponse(res);

    const responseBody = await response.arrayBuffer();
    const responseHeaders: string[][] = [];
    response.headers.forEach((value: string, key: string) => {
      responseHeaders.push([key, value]);
    });

    return {
      status: response.status,
      headers: responseHeaders,
      body: responseBody,
    };
  },
});
`;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, code);
}

// ---------------------------------------------------------------------------
// Static file upload
// ---------------------------------------------------------------------------

let useProd = false;

function convexRunAsync(
  functionPath: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const cmdArgs = [
      "convex",
      "run",
      functionPath,
      JSON.stringify(args),
      "--typecheck=disable",
      "--codegen=disable",
    ];
    if (useProd) cmdArgs.push("--prod");
    execFile("npx", cmdArgs, { encoding: "utf-8" }, (error, stdout, stderr) => {
      if (error) {
        console.error("Convex run failed:", stderr || stdout);
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

interface StaticFile {
  path: string; // e.g. "/_next/static/chunks/main-xxx.js"
  localPath: string;
  contentType: string;
}

function collectStaticFiles(staticDir: string): StaticFile[] {
  const files: StaticFile[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const relPath = relative(staticDir, fullPath).replace(/\\/g, "/");
        files.push({
          path: `/_next/static/${relPath}`,
          localPath: fullPath,
          contentType: getMimeType(fullPath),
        });
      }
    }
  }

  walk(staticDir);
  return files;
}

async function uploadSingleFile(
  file: StaticFile,
  componentName: string,
  deploymentId: string,
): Promise<void> {
  const content = readFileSync(file.localPath);

  // Generate upload URL
  const uploadUrlOutput = await convexRunAsync(
    `${componentName}:generateUploadUrl`,
  );
  const uploadUrl = JSON.parse(uploadUrlOutput);

  // Upload file
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.contentType },
    body: content,
  });

  const { storageId } = (await response.json()) as { storageId: string };

  // Record the asset
  await convexRunAsync(`${componentName}:recordAsset`, {
    path: file.path,
    storageId,
    contentType: file.contentType,
    deploymentId,
  });
}

async function uploadStaticFiles(
  staticDir: string,
  componentName: string,
  deploymentId: string,
  concurrency: number = 5,
): Promise<void> {
  const files = collectStaticFiles(staticDir);
  if (files.length === 0) {
    console.log("  No static files to upload.");
    return;
  }

  const total = files.length;
  let completed = 0;
  let failed = false;

  const pending = new Set<Promise<void>>();
  const iterator = files[Symbol.iterator]();

  function enqueue(): Promise<void> | undefined {
    if (failed) return;
    const next = iterator.next();
    if (next.done) return;
    const file = next.value;

    const task = uploadSingleFile(file, componentName, deploymentId).then(
      () => {
        completed++;
        console.log(`  [${completed}/${total}] ${file.path}`);
        pending.delete(task);
      },
    );

    task.catch(() => {
      failed = true;
    });

    pending.add(task);
    return task;
  }

  // Fill initial pool
  for (let i = 0; i < concurrency && i < total; i++) {
    void enqueue();
  }

  // Process remaining
  while (pending.size > 0) {
    await Promise.race(pending);
    if (failed) {
      await Promise.allSettled(pending);
      throw new Error("Static file upload failed");
    }
    void enqueue();
  }

  // Garbage collect old assets and set deployment
  const gcOutput = await convexRunAsync(`${componentName}:gcOldAssets`, {
    currentDeploymentId: deploymentId,
  });
  const gcResult = JSON.parse(gcOutput);
  const deletedCount =
    typeof gcResult === "number" ? gcResult : gcResult.deleted;
  if (deletedCount > 0) {
    console.log(
      `  Cleaned up ${deletedCount} old file(s) from previous deployments`,
    );
  }
}

// ---------------------------------------------------------------------------
// Modules tarball upload
// ---------------------------------------------------------------------------

async function uploadModulesTarball(
  standaloneDir: string,
  componentName: string,
  deploymentId: string,
): Promise<void> {
  const modulesDir = join(standaloneDir, "node_modules");
  if (!existsSync(modulesDir)) {
    throw new Error(
      `Standalone node_modules not found at ${modulesDir}`,
    );
  }

  // Create tarball of the standalone node_modules
  const tarballPath = join(standaloneDir, "__next_modules__.tar.gz");
  execSync(
    `tar czf "${tarballPath}" -C "${standaloneDir}" node_modules`,
    { stdio: "pipe" },
  );

  const tarballSize = statSync(tarballPath).size;
  console.log(
    `  Tarball: ${(tarballSize / 1024 / 1024).toFixed(1)} MiB`,
  );

  // Upload tarball to Convex storage
  const uploadUrlOutput = await convexRunAsync(
    `${componentName}:generateUploadUrl`,
  );
  const uploadUrl = JSON.parse(uploadUrlOutput);

  const content = readFileSync(tarballPath);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "application/gzip" },
    body: content,
  });

  const { storageId } = (await response.json()) as { storageId: string };

  // Record with the same deploymentId as static files so GC doesn't delete it
  await convexRunAsync(`${componentName}:recordAsset`, {
    path: "/__next_modules__.tar.gz",
    storageId,
    contentType: "application/gzip",
    deploymentId,
  });

  // Clean up local tarball
  unlinkSync(tarballPath);

  console.log("  Modules tarball uploaded to Convex storage.");
}

// ---------------------------------------------------------------------------
// convex.json configuration
// ---------------------------------------------------------------------------

function ensureConvexJson(convexDir: string): void {
  // convex.json lives in the project root (parent of convex/)
  const projectRoot = resolve(dirname(convexDir));
  const convexJsonPath = join(projectRoot, "convex.json");

  let config: Record<string, unknown> = {};
  if (existsSync(convexJsonPath)) {
    config = JSON.parse(readFileSync(convexJsonPath, "utf-8"));
  }

  // Ensure node.externalPackages includes "tar" (needed for extraction at runtime)
  const node = (config.node as Record<string, unknown>) || {};
  const externalPackages = (node.externalPackages as string[]) || [];
  for (const pkg of ["tar"]) {
    if (!externalPackages.includes(pkg)) {
      externalPackages.push(pkg);
    }
  }
  node.externalPackages = externalPackages;
  config.node = node;

  writeFileSync(convexJsonPath, JSON.stringify(config, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  useProd = args.prod;
  const convexDir = resolve(args.convexDir);

  // Step 1: Run next build
  if (!args.skipBuild) {
    console.log("Building Next.js app...");
    const buildResult = spawnSync("npx", ["next", "build"], {
      stdio: "inherit",
    });
    if (buildResult.status !== 0) {
      console.error("Next.js build failed.");
      process.exit(1);
    }
    console.log("");
  }

  // Step 2: Verify standalone output exists
  const standaloneDir = resolve(".next/standalone");
  if (!existsSync(standaloneDir)) {
    console.error(
      'Error: .next/standalone not found. Make sure next.config has output: "standalone".',
    );
    process.exit(1);
  }

  // Step 3: Collect build files
  console.log("Collecting build files...");
  const buildFiles = collectBuildFiles(standaloneDir);
  const textCount = buildFiles.filter((f) => f.isText).length;
  const binaryCount = buildFiles.filter((f) => !f.isText).length;
  const totalSize = buildFiles.reduce((sum, f) => sum + f.content.length, 0);
  console.log(
    `  ${buildFiles.length} files (${textCount} text, ${binaryCount} binary, ${(totalSize / 1024).toFixed(0)} KB total)`,
  );

  // Step 4: Generate the server file
  const outputPath = join(convexDir, "_generatedNextServer.ts");
  console.log(`\nGenerating ${relative(process.cwd(), outputPath)}...`);
  generateServerFile(buildFiles, outputPath, args.componentApi);

  const generatedSize = statSync(outputPath).size;
  console.log(`  Generated file: ${(generatedSize / 1024).toFixed(0)} KB`);

  if (generatedSize > 30 * 1024 * 1024) {
    console.warn(
      "\n  WARNING: Generated file exceeds 30 MB. It may exceed Convex's 32 MB bundle limit.",
    );
    console.warn(
      "  Consider reducing the number of pages or using dynamic imports.",
    );
  }

  // Step 5: Ensure convex.json has externalPackages
  console.log("\nUpdating convex.json...");
  ensureConvexJson(convexDir);
  console.log('  Added node.externalPackages: ["tar"]');

  // Step 6: Upload modules tarball and static files (same deploymentId for all)
  if (!args.skipUpload) {
    const envLabel = args.prod ? "production" : "development";
    const deploymentId = randomUUID();

    // Upload the standalone node_modules as a tarball
    console.log(`\nUploading Next.js modules tarball to ${envLabel}...`);
    try {
      await uploadModulesTarball(standaloneDir, args.component, deploymentId);
    } catch (error) {
      console.error("\nFailed to upload modules tarball:", error);
      console.error(
        "Make sure your Convex backend is deployed. You can upload later with:",
      );
      console.error(
        "  npx @convex-dev/self-hosting next-build --skip-build --prod",
      );
    }

    // Upload static assets (same deploymentId so GC doesn't delete the tarball)
    let staticDir = join(standaloneDir, ".next", "static");
    if (!existsSync(staticDir)) {
      staticDir = resolve(".next/static");
    }

    if (existsSync(staticDir)) {
      console.log(`\nUploading static assets to ${envLabel}...`);
      try {
        await uploadStaticFiles(staticDir, args.component, deploymentId);
        console.log("\nStatic assets uploaded.");
      } catch (error) {
        console.error("\nFailed to upload static assets:", error);
        console.error(
          "Make sure your Convex backend is deployed. You can upload later with:",
        );
        console.error(
          "  npx @convex-dev/self-hosting next-build --skip-build --prod",
        );
      }
    } else {
      console.log("\nNo static directory found, skipping upload.");
    }
  } else {
    console.log("\nSkipping uploads (--skip-upload).");
  }

  console.log("\nDone! Next steps:");
  console.log("  npx convex deploy");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
