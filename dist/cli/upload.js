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
import { execSync, execFile, spawnSync } from "child_process";
// MIME type mapping
const MIME_TYPES = {
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
function getMimeType(path) {
    return MIME_TYPES[extname(path).toLowerCase()] || "application/octet-stream";
}
function parseArgs(args) {
    const result = {
        dist: "./dist",
        component: "staticHosting",
        prod: false, // Default to dev, use --prod for production
        build: false,
        cdn: false,
        cdnDeleteFunction: "",
        concurrency: 5,
        help: false,
    };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--help" || arg === "-h") {
            result.help = true;
        }
        else if (arg === "--dist" || arg === "-d") {
            result.dist = args[++i] || result.dist;
        }
        else if (arg === "--component" || arg === "-c") {
            result.component = args[++i] || result.component;
        }
        else if (arg === "--prod") {
            result.prod = true;
        }
        else if (arg === "--no-prod" || arg === "--dev") {
            result.prod = false;
        }
        else if (arg === "--build" || arg === "-b") {
            result.build = true;
        }
        else if (arg === "--cdn") {
            result.cdn = true;
        }
        else if (arg === "--cdn-delete-function") {
            result.cdnDeleteFunction = args[++i] || result.cdnDeleteFunction;
        }
        else if (arg === "--concurrency" || arg === "-j") {
            const val = parseInt(args[++i], 10);
            if (val > 0)
                result.concurrency = val;
        }
    }
    return result;
}
function showHelp() {
    console.log(`
Usage: npx @convex-dev/self-hosting upload [options]

Upload static files from a dist directory to Convex storage.

Options:
  -d, --dist <path>           Path to dist directory (default: ./dist)
  -c, --component <name>      Convex component with upload functions (default: staticHosting)
      --prod                  Deploy to production deployment
  -b, --build                 Run 'npm run build' with correct VITE_CONVEX_URL before uploading
      --cdn                   Upload non-HTML assets to convex-fs CDN instead of Convex storage
      --cdn-delete-function <name>  Convex function to delete CDN blobs (default: <component>:deleteCdnBlobs)
  -j, --concurrency <n>       Number of parallel uploads (default: 5)
  -h, --help                  Show this help message

Examples:
  # Upload to Convex storage
  npx @convex-dev/self-hosting upload
  npx @convex-dev/self-hosting upload --dist ./build --prod
  npx @convex-dev/self-hosting upload --build --prod

  # Upload with CDN (non-HTML files served from CDN)
  npx @convex-dev/self-hosting upload --cdn --prod
`);
}
// Global flag for production mode
let useProd = true;
function _convexRun(functionPath, args = {}) {
    const argsJson = JSON.stringify(args);
    const prodFlag = useProd ? "--prod" : "";
    const cmd = `npx convex run "${functionPath}" '${argsJson}' ${prodFlag} --typecheck=disable --codegen=disable`;
    try {
        const result = execSync(cmd, {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
        });
        return result.trim();
    }
    catch (error) {
        const execError = error;
        console.error("Convex run failed:", execError.stderr || execError.stdout);
        throw error;
    }
}
function convexRunAsync(functionPath, args = {}) {
    return new Promise((resolve, reject) => {
        const cmdArgs = [
            "convex",
            "run",
            functionPath,
            JSON.stringify(args),
            "--typecheck=disable",
            "--codegen=disable",
        ];
        if (useProd)
            cmdArgs.push("--prod");
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
async function uploadSingleFile(file, componentName, deploymentId, useCdn, siteUrl) {
    const content = readFileSync(file.localPath);
    const isHtml = file.contentType.startsWith("text/html");
    if (useCdn && !isHtml && siteUrl) {
        // CDN mode: upload non-HTML files to convex-fs
        const uploadResponse = await fetch(`${siteUrl}/fs/upload`, {
            method: "POST",
            headers: { "Content-Type": file.contentType },
            body: content,
        });
        if (!uploadResponse.ok) {
            throw new Error(`CDN upload failed for ${file.path}: ${uploadResponse.status}`);
        }
        const { blobId } = (await uploadResponse.json());
        await convexRunAsync(`${componentName}:recordAsset`, {
            path: file.path,
            blobId,
            contentType: file.contentType,
            deploymentId,
        });
        return { path: file.path, mode: "cdn" };
    }
    else {
        // Standard mode: upload to Convex storage
        const uploadUrlOutput = await convexRunAsync(`${componentName}:generateUploadUrl`);
        const uploadUrl = JSON.parse(uploadUrlOutput);
        const response = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": file.contentType },
            body: content,
        });
        const { storageId } = (await response.json());
        await convexRunAsync(`${componentName}:recordAsset`, {
            path: file.path,
            storageId,
            contentType: file.contentType,
            deploymentId,
        });
        return { path: file.path, mode: isHtml ? "storage/html" : "storage" };
    }
}
async function uploadWithConcurrency(files, componentName, deploymentId, useCdn, siteUrl, concurrency) {
    const total = files.length;
    let completed = 0;
    let failed = false;
    const pending = new Set();
    const iterator = files[Symbol.iterator]();
    function enqueue() {
        if (failed)
            return;
        const next = iterator.next();
        if (next.done)
            return;
        const file = next.value;
        const task = uploadSingleFile(file, componentName, deploymentId, useCdn, siteUrl).then(({ path, mode }) => {
            completed++;
            console.log(`  [${completed}/${total}] ${path} (${mode})`);
            pending.delete(task);
        });
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
    // Process remaining files as slots open
    while (pending.size > 0) {
        await Promise.race(pending);
        if (failed) {
            // Wait for in-flight tasks to settle, then throw
            await Promise.allSettled(pending);
            throw new Error("Upload failed");
        }
        void enqueue();
    }
}
function collectFiles(dir, baseDir) {
    const files = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectFiles(fullPath, baseDir));
        }
        else if (entry.isFile()) {
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
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        showHelp();
        process.exit(0);
    }
    // Set global prod flag
    useProd = args.prod;
    // Run build if requested
    if (args.build) {
        let convexUrl = null;
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
            }
            catch {
                console.error("Could not get production Convex URL.");
                console.error("Make sure you have deployed to production: npx convex deploy");
                process.exit(1);
            }
        }
        else {
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
    const useCdn = args.cdn;
    // Convex storage deployment
    if (!existsSync(distDir)) {
        console.error(`Error: dist directory not found: ${distDir}`);
        console.error("Run your build command first (e.g., 'npm run build' or add --build flag)");
        process.exit(1);
    }
    // If CDN mode, we need the site URL for uploading to convex-fs
    let siteUrl = null;
    if (useCdn) {
        siteUrl = getConvexSiteUrl(useProd);
        if (!siteUrl) {
            console.error("Error: Could not determine Convex site URL for CDN uploads.");
            console.error("Make sure your Convex deployment is running.");
            process.exit(1);
        }
    }
    const deploymentId = randomUUID();
    const files = collectFiles(distDir, distDir);
    const envLabel = useProd ? "production" : "development";
    console.log(`🚀 Deploying to ${envLabel} environment`);
    if (useCdn) {
        console.log("☁️  CDN mode: non-HTML assets will be uploaded to convex-fs");
    }
    console.log("🔒 Using secure internal functions (requires Convex CLI auth)");
    console.log(`Uploading ${files.length} files with deployment ID: ${deploymentId}`);
    console.log(`Component: ${componentName}`);
    console.log("");
    try {
        await uploadWithConcurrency(files, componentName, deploymentId, useCdn, siteUrl, args.concurrency);
    }
    catch {
        console.error("Upload failed.");
        process.exit(1);
    }
    console.log("");
    // Garbage collect old files
    const gcOutput = await convexRunAsync(`${componentName}:gcOldAssets`, {
        currentDeploymentId: deploymentId,
    });
    const gcResult = JSON.parse(gcOutput);
    // Handle both old format (number) and new format ({ deleted, blobIds })
    const deletedCount = typeof gcResult === "number" ? gcResult : gcResult.deleted;
    const oldBlobIds = typeof gcResult === "object" && gcResult.blobIds ? gcResult.blobIds : [];
    if (deletedCount > 0) {
        console.log(`Cleaned up ${deletedCount} old storage file(s) from previous deployments`);
    }
    // Clean up old CDN blobs if any
    if (oldBlobIds.length > 0) {
        const cdnDeleteFn = args.cdnDeleteFunction || `${componentName}:deleteCdnBlobs`;
        try {
            await convexRunAsync(cdnDeleteFn, { blobIds: oldBlobIds });
            console.log(`Cleaned up ${oldBlobIds.length} old CDN blob(s) from previous deployments`);
        }
        catch {
            console.warn(`Warning: Could not delete old CDN blobs. Make sure ${cdnDeleteFn} is defined.`);
        }
    }
    console.log("");
    console.log("✨ Upload complete!");
    // Show the deployment URL
    const deployedSiteUrl = getConvexSiteUrl(useProd);
    if (deployedSiteUrl) {
        console.log("");
        console.log(`Your app is now available at: ${deployedSiteUrl}`);
    }
}
/**
 * Get the Convex site URL (.convex.site) from the cloud URL
 */
function getConvexSiteUrl(prod) {
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
    }
    catch {
        // Ignore errors
    }
    return null;
}
main().catch((error) => {
    console.error("Upload failed:", error);
    process.exit(1);
});
//# sourceMappingURL=upload.js.map