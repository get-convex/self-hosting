#!/usr/bin/env node
/**
 * Interactive setup wizard for Convex Self Static Hosting.
 *
 * Usage:
 *   npx @get-convex/self-static-hosting setup
 *
 * This command will:
 * 1. Ask about deployment mode
 * 2. Create necessary Convex files
 * 3. Configure Cloudflare (if selected)
 * 4. Add deploy script to package.json
 */
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";
import { join } from "path";
const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
});
function prompt(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
}
function promptChoice(question, choices) {
    return new Promise((resolve) => {
        console.log(question);
        console.log("");
        choices.forEach((choice, index) => {
            console.log(`  ${index + 1}) ${choice.label}`);
            console.log(`     ${choice.description}`);
            console.log("");
        });
        rl.question(`Enter your choice (1-${choices.length}): `, (answer) => {
            const choice = parseInt(answer.trim(), 10) - 1;
            if (choice >= 0 && choice < choices.length) {
                resolve(choices[choice].key);
            }
            else {
                console.log("Invalid choice. Please try again.");
                resolve(promptChoice(question, choices));
            }
        });
    });
}
function promptYesNo(question, defaultYes = true) {
    return new Promise((resolve) => {
        const hint = defaultYes ? "[Y/n]" : "[y/N]";
        rl.question(`${question} ${hint} `, (answer) => {
            const a = answer.trim().toLowerCase();
            if (a === "") {
                resolve(defaultYes);
            }
            else {
                resolve(a === "y" || a === "yes");
            }
        });
    });
}
function success(message) {
    console.log(`✓ ${message}`);
}
function error(message) {
    console.log(`✗ ${message}`);
}
/**
 * Create or update convex.config.ts
 */
function createConvexConfig() {
    const configPath = join(process.cwd(), "convex", "convex.config.ts");
    const configContent = `import { defineApp } from "convex/server";
import selfStaticHosting from "@get-convex/self-static-hosting/convex.config";

const app = defineApp();
app.use(selfStaticHosting);

export default app;
`;
    if (existsSync(configPath)) {
        const existing = readFileSync(configPath, "utf-8");
        if (existing.includes("selfStaticHosting")) {
            success("convex/convex.config.ts already configured");
            return false;
        }
        // Ask before modifying
        console.log("⚠️  convex/convex.config.ts exists but doesn't include selfStaticHosting");
        console.log("You'll need to manually add:");
        console.log('  import selfStaticHosting from "@get-convex/self-static-hosting/convex.config";');
        console.log("  app.use(selfStaticHosting);");
        return false;
    }
    writeFileSync(configPath, configContent);
    success("Created convex/convex.config.ts");
    return true;
}
/**
 * Create staticHosting.ts with upload API
 */
function createStaticHostingFile() {
    const filePath = join(process.cwd(), "convex", "staticHosting.ts");
    const content = `import { components } from "./_generated/api";
import {
  exposeUploadApi,
  exposeDeploymentQuery,
} from "@get-convex/self-static-hosting";

// Internal functions for secure uploads (CLI only)
export const { generateUploadUrl, recordAsset, gcOldAssets, listAssets } =
  exposeUploadApi(components.selfStaticHosting);

// Public query for live reload notifications
export const { getCurrentDeployment } =
  exposeDeploymentQuery(components.selfStaticHosting);
`;
    if (existsSync(filePath)) {
        success("convex/staticHosting.ts already exists");
        return false;
    }
    writeFileSync(filePath, content);
    success("Created convex/staticHosting.ts");
    return true;
}
/**
 * Create http.ts with static routes (only for Convex storage mode)
 */
function createHttpFile() {
    const filePath = join(process.cwd(), "convex", "http.ts");
    const content = `import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@get-convex/self-static-hosting";
import { components } from "./_generated/api";

const http = httpRouter();

// Serve static files at root with SPA fallback
registerStaticRoutes(http, components.selfStaticHosting);

// Or serve at a path prefix (recommended if you have API routes):
// registerStaticRoutes(http, components.selfStaticHosting, {
//   pathPrefix: "/app",
//   spaFallback: true,
// });

export default http;
`;
    if (existsSync(filePath)) {
        const existing = readFileSync(filePath, "utf-8");
        if (existing.includes("registerStaticRoutes")) {
            success("convex/http.ts already configured");
            return false;
        }
        // Ask before modifying
        console.log("⚠️  convex/http.ts exists but doesn't include registerStaticRoutes");
        console.log("You'll need to manually add:");
        console.log('  import { registerStaticRoutes } from "@get-convex/self-static-hosting";');
        console.log("  registerStaticRoutes(http, components.selfStaticHosting);");
        return false;
    }
    writeFileSync(filePath, content);
    success("Created convex/http.ts");
    return true;
}
/**
 * Update package.json with deploy script
 */
function updatePackageJson(config) {
    const pkgPath = join(process.cwd(), "package.json");
    if (!existsSync(pkgPath)) {
        error("package.json not found");
        return false;
    }
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    if (!pkg.scripts) {
        pkg.scripts = {};
    }
    let deployCommand;
    if (config.mode === "cloudflare-pages" && config.pagesProject) {
        deployCommand = `npx @get-convex/self-static-hosting deploy --cloudflare-pages --pages-project ${config.pagesProject}`;
    }
    else {
        deployCommand = "npx @get-convex/self-static-hosting deploy";
    }
    if (pkg.scripts.deploy && pkg.scripts.deploy !== deployCommand) {
        console.log("⚠️  package.json already has a 'deploy' script");
        console.log(`   Current: ${pkg.scripts.deploy}`);
        console.log(`   Suggested: ${deployCommand}`);
        return false;
    }
    pkg.scripts.deploy = deployCommand;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    success("Updated package.json with deploy script");
    return true;
}
/**
 * Update .env.local with Cloudflare Pages project
 */
function updateEnvLocal(pagesProject) {
    const envPath = join(process.cwd(), ".env.local");
    let envContent = "";
    if (existsSync(envPath)) {
        envContent = readFileSync(envPath, "utf-8");
    }
    if (envContent.includes("CLOUDFLARE_PAGES_PROJECT")) {
        success(".env.local already has CLOUDFLARE_PAGES_PROJECT");
        return;
    }
    const newLine = `\nCLOUDFLARE_PAGES_PROJECT=${pagesProject}\n`;
    writeFileSync(envPath, envContent + newLine);
    success("Updated .env.local with CLOUDFLARE_PAGES_PROJECT");
}
/**
 * Run the Cloudflare Pages setup
 */
async function setupCloudflarePages() {
    console.log("");
    console.log("📦 Cloudflare Pages Setup");
    console.log("");
    // Check if wrangler is available
    try {
        execSync("npx wrangler --version", { stdio: "pipe" });
    }
    catch {
        error("Wrangler is required for Cloudflare Pages");
        console.log("   Install: npm install -D wrangler");
        return null;
    }
    // Check login status
    try {
        execSync("npx wrangler whoami", { stdio: "pipe" });
        success("Already logged in to Cloudflare");
    }
    catch {
        console.log("Not logged in to Cloudflare");
        const shouldLogin = await promptYesNo("Run 'wrangler login' now?", true);
        if (shouldLogin) {
            try {
                execSync("npx wrangler login", { stdio: "inherit" });
                success("Logged in to Cloudflare");
            }
            catch {
                error("Login failed");
                return null;
            }
        }
        else {
            console.log("⚠️  You'll need to login later with: npx wrangler login");
        }
    }
    // Ask for project name
    const defaultProject = join(process.cwd()).split("/").pop() || "my-app";
    const projectName = await prompt(`Cloudflare Pages project name [${defaultProject}]: `);
    return projectName || defaultProject;
}
async function main() {
    console.log("");
    console.log("🚀 Convex Self Static Hosting Setup");
    console.log("════════════════════════════════════════");
    console.log("");
    // Check if we're in a Convex project
    if (!existsSync("convex")) {
        error("No 'convex' directory found");
        console.log("   Make sure you're in a Convex project directory");
        console.log("   Run 'npx convex dev' to initialize");
        rl.close();
        process.exit(1);
    }
    // Step 1: Choose deployment mode
    console.log("This wizard will:");
    console.log("  1. Create necessary Convex files");
    console.log("  2. Configure your deployment mode");
    console.log("  3. Set up Cloudflare (if selected)");
    console.log("");
    const mode = await promptChoice("Which deployment mode do you want?", [
        {
            key: "cloudflare-pages",
            label: "Cloudflare Pages (Recommended)",
            description: "Edge performance, no storage costs, built-in SPA routing",
        },
        {
            key: "convex-storage",
            label: "Convex Storage",
            description: "Simpler setup, no external dependencies, all in Convex",
        },
        {
            key: "convex-cdn",
            label: "Convex Storage + Cloudflare CDN (Advanced)",
            description: "Custom domain, edge caching, files stored in Convex",
        },
    ]);
    const config = {
        mode: mode,
        createHttp: mode !== "cloudflare-pages",
    };
    // Step 2: Cloudflare Pages project name (if applicable)
    if (mode === "cloudflare-pages") {
        const pagesProject = await setupCloudflarePages();
        if (!pagesProject) {
            error("Cloudflare Pages setup failed");
            rl.close();
            process.exit(1);
        }
        config.pagesProject = pagesProject;
    }
    console.log("");
    console.log("📝 Creating files...");
    console.log("");
    // Step 3: Create files
    createConvexConfig();
    createStaticHostingFile();
    if (config.createHttp) {
        createHttpFile();
    }
    else {
        console.log("ℹ️  Skipping convex/http.ts (not needed for Cloudflare Pages)");
    }
    updatePackageJson(config);
    if (config.pagesProject) {
        updateEnvLocal(config.pagesProject);
    }
    // Step 4: Show next steps
    console.log("");
    console.log("✨ Setup complete!");
    console.log("");
    console.log("Next steps:");
    console.log("");
    console.log("  1. Run convex dev to generate types:");
    console.log("     npx convex dev");
    console.log("");
    console.log("  2. Build your frontend:");
    console.log("     npm run build");
    console.log("");
    console.log("  3. Deploy everything:");
    console.log("     npm run deploy");
    console.log("");
    if (mode === "cloudflare-pages") {
        console.log("Your app will be available at:");
        console.log(`  https://${config.pagesProject}.pages.dev`);
    }
    else {
        console.log("Your app will be available at:");
        console.log("  https://your-deployment.convex.site");
    }
    console.log("");
    // Ask if they want to run setup-cloudflare for CDN mode
    if (mode === "convex-cdn") {
        console.log("⚠️  For Cloudflare CDN setup, run:");
        console.log("   npx @get-convex/self-static-hosting setup-cloudflare");
        console.log("");
    }
    rl.close();
}
main().catch((error) => {
    console.error("Setup failed:", error);
    rl.close();
    process.exit(1);
});
//# sourceMappingURL=setup.js.map