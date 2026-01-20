#!/usr/bin/env node
/**
 * Upload static files to Cloudflare Workers with Static Assets.
 *
 * This module uses wrangler CLI to deploy files directly to Cloudflare Workers,
 * bypassing Convex storage for a pure edge deployment.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync, rmSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import { execSync, spawnSync } from "child_process";
import { randomUUID } from "crypto";
import { homedir, tmpdir } from "os";

export interface CloudflareWorkersOptions {
  distDir: string;
  workerName: string;
  accountId?: string;
  apiToken?: string;
  convexComponent?: string;
  prod?: boolean;
}

/**
 * Get Cloudflare API token from various sources
 */
export function getCloudflareApiToken(): string | null {
  // Check environment variable first
  if (process.env.CLOUDFLARE_API_TOKEN) {
    return process.env.CLOUDFLARE_API_TOKEN;
  }

  // Try to read from wrangler config
  const configPaths = [
    join(
      homedir(),
      "Library",
      "Preferences",
      ".wrangler",
      "config",
      "default.toml",
    ),
    join(homedir(), ".wrangler", "config", "default.toml"),
    join(homedir(), ".wrangler", "config.toml"),
    join(homedir(), ".config", ".wrangler", "config", "default.toml"),
  ];

  const tokenPatterns = [
    /oauth_token\s*=\s*"([^"]+)"/,
    /access_token\s*=\s*"([^"]+)"/,
    /token\s*=\s*"([^"]+)"/,
  ];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, "utf-8");
        for (const pattern of tokenPatterns) {
          const match = content.match(pattern);
          if (match) {
            return match[1];
          }
        }
      } catch {
        // Ignore read errors
      }
    }
  }

  return null;
}

/**
 * Get Cloudflare account ID from API
 */
export async function getCloudflareAccountId(
  apiToken: string,
): Promise<string | null> {
  try {
    const response = await fetch(
      "https://api.cloudflare.com/client/v4/accounts?per_page=1",
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    const data = (await response.json()) as {
      success: boolean;
      result: Array<{ id: string }>;
    };
    if (data.success && data.result.length > 0) {
      return data.result[0].id;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Get the workers.dev subdomain for an account
 */
export async function getWorkerSubdomain(
  accountId: string,
  apiToken: string,
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    const data = (await response.json()) as {
      success: boolean;
      result: { subdomain: string };
    };
    if (data.success && data.result) {
      return data.result.subdomain;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Count files in a directory recursively
 */
function countFiles(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countFiles(fullPath);
    } else if (entry.isFile()) {
      count++;
    }
  }
  return count;
}

/**
 * Update Convex deployment info for live reload
 */
function updateConvexDeployment(
  componentName: string,
  deploymentId: string,
  prod: boolean,
): void {
  const prodFlag = prod ? "--prod" : "";
  const args = JSON.stringify({ deploymentId });
  try {
    execSync(
      `npx convex run "${componentName}:setCurrentDeployment" '${args}' ${prodFlag} --typecheck=disable --codegen=disable`,
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  } catch {
    // Non-fatal - live reload won't work but deployment succeeded
    console.warn(
      "  Could not update Convex deployment info (live reload may not work)",
    );
  }
}

/**
 * Deploy to Cloudflare Workers with Static Assets using wrangler CLI
 */
export async function deployToCloudflareWorkers(
  options: CloudflareWorkersOptions,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const {
    distDir,
    workerName,
    convexComponent = "staticHosting",
    prod = false,
  } = options;

  // Resolve dist directory
  const resolvedDistDir = resolve(distDir);
  if (!existsSync(resolvedDistDir)) {
    return {
      success: false,
      error: `Dist directory not found: ${resolvedDistDir}`,
    };
  }

  const fileCount = countFiles(resolvedDistDir);
  console.log(`   Found ${fileCount} files in ${distDir}`);

  // Get API token
  const apiToken = options.apiToken || getCloudflareApiToken();
  if (!apiToken) {
    return {
      success: false,
      error:
        "No Cloudflare API token found. Run 'npx wrangler login' or set CLOUDFLARE_API_TOKEN",
    };
  }

  // Get account ID
  let accountId: string | null = options.accountId || process.env.CLOUDFLARE_ACCOUNT_ID || null;
  if (!accountId) {
    console.log("   Looking up Cloudflare account ID...");
    accountId = await getCloudflareAccountId(apiToken);
    if (!accountId) {
      return {
        success: false,
        error:
          "Could not determine Cloudflare account ID. Set CLOUDFLARE_ACCOUNT_ID or check your API token permissions.",
      };
    }
  }

  // Generate deployment ID for tracking
  const deploymentId = randomUUID();

  // Create temporary wrangler.json config
  const tempDir = join(tmpdir(), `wrangler-deploy-${deploymentId}`);
  mkdirSync(tempDir, { recursive: true });

  const wranglerConfig = {
    name: workerName,
    compatibility_date: "2024-12-01",
    assets: {
      directory: resolvedDistDir,
      not_found_handling: "single-page-application",
    },
  };

  const wranglerConfigPath = join(tempDir, "wrangler.json");
  writeFileSync(wranglerConfigPath, JSON.stringify(wranglerConfig, null, 2));

  // Deploy using wrangler
  console.log("");
  console.log(`   Deploying to Cloudflare Workers: ${workerName}...`);
  console.log("");

  const wranglerArgs = [
    "wrangler",
    "deploy",
    "--config",
    wranglerConfigPath,
  ];

  const result = spawnSync("npx", wranglerArgs, {
    stdio: "inherit",
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: apiToken,
      CLOUDFLARE_ACCOUNT_ID: accountId,
    },
  });

  // Clean up temporary config
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }

  if (result.status !== 0) {
    return {
      success: false,
      error: "Wrangler deployment failed. Check the output above for details.",
    };
  }

  // Update Convex deployment info for live reload
  console.log("");
  console.log("   Updating Convex deployment info...");
  updateConvexDeployment(convexComponent, deploymentId, prod);

  // Get worker subdomain for URL
  const subdomain = await getWorkerSubdomain(accountId, apiToken);
  const url = subdomain
    ? `https://${workerName}.${subdomain}.workers.dev`
    : `https://${workerName}.workers.dev`;

  return {
    success: true,
    url,
  };
}

/**
 * Main entry point for CLI
 */
export async function main(args: {
  dist: string;
  workerName: string;
  component?: string;
  prod?: boolean;
}): Promise<void> {
  console.log("");
  console.log("  Cloudflare Workers Deployment");
  console.log("===============================================================");
  console.log("");

  const result = await deployToCloudflareWorkers({
    distDir: args.dist,
    workerName: args.workerName,
    convexComponent: args.component,
    prod: args.prod,
  });

  if (!result.success) {
    console.error(`  ${result.error}`);
    process.exit(1);
  }

  console.log("");
  console.log("===============================================================");
  console.log("  Deployment complete!");
  console.log("");
  console.log(`Your site is live at: ${result.url}`);
  console.log("");
}
