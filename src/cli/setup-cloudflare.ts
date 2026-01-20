#!/usr/bin/env node
/**
 * Interactive Cloudflare setup wizard.
 *
 * Usage:
 *   npx @get-convex/self-static-hosting setup-cloudflare
 *
 * This command will:
 * 1. Check/install wrangler (Cloudflare CLI)
 * 2. Login to Cloudflare
 * 3. Help select or add a domain
 * 4. Configure DNS to point to your Convex site
 * 5. Save credentials to .env.local
 */

import { execSync, spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { createInterface } from "readline";
import { homedir } from "os";
import { join } from "path";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function promptYesNo(question: string, defaultYes = true): Promise<boolean> {
  return new Promise((resolve) => {
    const hint = defaultYes ? "[Y/n]" : "[y/N]";
    rl.question(`${question} ${hint} `, (answer) => {
      const a = answer.trim().toLowerCase();
      if (a === "") {
        resolve(defaultYes);
      } else {
        resolve(a === "y" || a === "yes");
      }
    });
  });
}

function log(message: string): void {
  console.log(message);
}

function success(message: string): void {
  console.log(`✅ ${message}`);
}

function info(message: string): void {
  console.log(`ℹ️  ${message}`);
}

function warn(message: string): void {
  console.log(`⚠️  ${message}`);
}

function error(message: string): void {
  console.log(`❌ ${message}`);
}

/**
 * Check if a command exists
 */
function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the Convex production site URL by running convex dashboard --prod
 */
function getConvexProdUrl(): string | null {
  try {
    const result = execSync("npx convex dashboard --prod --no-open", {
      stdio: "pipe",
      encoding: "utf-8",
    });
    // Output: "Opening https://dashboard.convex.dev/d/deployment-name in the default browser..."
    const match = result.match(/dashboard\.convex\.dev\/d\/([a-z0-9-]+)/i);
    if (match) {
      return `https://${match[1]}.convex.site`;
    }
  } catch {
    // Command failed, fall back to env files
  }
  return null;
}

/**
 * Check if static files have been deployed to production
 * by querying the component's getCurrentDeployment function
 */
function hasStaticDeployment(componentName: string = "staticHosting"): boolean {
  try {
    const result = execSync(
      `npx convex run ${componentName}:getCurrentDeployment --prod`,
      {
        stdio: "pipe",
        encoding: "utf-8",
      },
    );
    // If it returns null or empty, no deployment
    const trimmed = result.trim();
    return trimmed !== "null" && trimmed !== "" && trimmed !== "undefined";
  } catch {
    // Function doesn't exist or failed - no deployment
    return false;
  }
}

/**
 * Get the Convex site URL from environment files
 * Prioritizes production env files over dev
 */
function getConvexSiteUrl(preferProd: boolean = true): string | null {
  // Check production files first if preferProd is true
  const envFiles = preferProd
    ? [".env.production", ".env.production.local", ".env.local", ".env"]
    : [".env.local", ".env", ".env.production", ".env.production.local"];

  for (const envFile of envFiles) {
    if (existsSync(envFile)) {
      const content = readFileSync(envFile, "utf-8");
      const match = content.match(/(?:VITE_)?CONVEX_URL=(.+)/);
      if (match) {
        return match[1].trim().replace(".convex.cloud", ".convex.site");
      }
    }
  }
  return null;
}

/**
 * Check if wrangler is logged in by running `wrangler whoami`
 */
function isWranglerLoggedIn(): boolean {
  try {
    const result = execSync("npx wrangler whoami", {
      stdio: "pipe",
      encoding: "utf-8",
    });
    // If the command succeeds and doesn't contain "not authenticated", we're logged in
    return !result.toLowerCase().includes("not authenticated");
  } catch {
    return false;
  }
}

/**
 * Get API token from wrangler config (checks multiple locations/formats)
 */
function getWranglerToken(): string | null {
  // Check multiple config locations (varies by OS and wrangler version)
  const configPaths = [
    // macOS (wrangler 4.x)
    join(
      homedir(),
      "Library",
      "Preferences",
      ".wrangler",
      "config",
      "default.toml",
    ),
    // Linux/older versions
    join(homedir(), ".wrangler", "config", "default.toml"),
    join(homedir(), ".wrangler", "config.toml"),
    // XDG config on Linux
    join(homedir(), ".config", ".wrangler", "config", "default.toml"),
  ];

  const tokenPatterns = [
    /oauth_token\s*=\s*"([^"]+)"/,
    /access_token\s*=\s*"([^"]+)"/,
    /token\s*=\s*"([^"]+)"/,
  ];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, "utf-8");
      for (const pattern of tokenPatterns) {
        const match = content.match(pattern);
        if (match) {
          return match[1];
        }
      }
    }
  }
  return null;
}

/**
 * Make a Cloudflare API request
 */
async function cfApi(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<{
  success: boolean;
  result?: unknown;
  errors?: Array<{ message: string }>;
}> {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  return response.json() as Promise<{
    success: boolean;
    result?: unknown;
    errors?: Array<{ message: string }>;
  }>;
}

/**
 * List zones in the Cloudflare account
 */
async function listZones(
  token: string,
): Promise<Array<{ id: string; name: string; status: string }>> {
  const data = await cfApi("/zones?per_page=50", token);
  if (data.success && Array.isArray(data.result)) {
    return data.result as Array<{ id: string; name: string; status: string }>;
  }
  return [];
}

/**
 * Create a DNS record
 */
async function createDnsRecord(
  token: string,
  zoneId: string,
  record: { type: string; name: string; content: string; proxied: boolean },
): Promise<boolean> {
  // First check if record already exists
  const existing = await cfApi(
    `/zones/${zoneId}/dns_records?type=${record.type}&name=${record.name}`,
    token,
  );

  if (
    existing.success &&
    Array.isArray(existing.result) &&
    existing.result.length > 0
  ) {
    // Update existing record
    const existingRecord = existing.result[0] as { id: string };
    const data = await cfApi(
      `/zones/${zoneId}/dns_records/${existingRecord.id}`,
      token,
      {
        method: "PUT",
        body: JSON.stringify(record),
      },
    );
    return data.success;
  }

  // Create new record
  const data = await cfApi(`/zones/${zoneId}/dns_records`, token, {
    method: "POST",
    body: JSON.stringify(record),
  });
  return data.success;
}

/**
 * Create an API token with cache purge permissions
 */
async function createApiToken(
  oauthToken: string,
  zoneName: string,
  zoneId: string,
): Promise<string | null> {
  // Get account ID first
  const accountData = await cfApi("/accounts?per_page=1", oauthToken);
  if (
    !accountData.success ||
    !Array.isArray(accountData.result) ||
    accountData.result.length === 0
  ) {
    return null;
  }
  const _accountId = (accountData.result[0] as { id: string }).id;

  // Create API token
  const tokenData = await cfApi("/user/tokens", oauthToken, {
    method: "POST",
    body: JSON.stringify({
      name: `Convex Static Hosting - ${zoneName}`,
      policies: [
        {
          effect: "allow",
          resources: {
            [`com.cloudflare.api.account.zone.${zoneId}`]: "*",
          },
          permission_groups: [
            { id: "e17beae8b8cb423a99571f5b78e16e51", name: "Cache Purge" }, // Cache Purge permission
          ],
        },
      ],
    }),
  });

  if (tokenData.success && tokenData.result) {
    return (tokenData.result as { value: string }).value;
  }
  return null;
}

/**
 * Get the current SSL/TLS mode for a zone
 */
async function getSslMode(
  token: string,
  zoneId: string,
): Promise<string | null> {
  const data = await cfApi(`/zones/${zoneId}/settings/ssl`, token);
  if (data.success && data.result) {
    return (data.result as { value: string }).value;
  }
  return null;
}

/**
 * Set SSL/TLS mode for a zone
 */
async function setSslMode(
  token: string,
  zoneId: string,
  mode: string,
): Promise<boolean> {
  const data = await cfApi(`/zones/${zoneId}/settings/ssl`, token, {
    method: "PATCH",
    body: JSON.stringify({ value: mode }),
  });
  return data.success;
}

/**
 * Get account ID from token
 */
async function getAccountId(token: string): Promise<string | null> {
  const accountData = await cfApi("/accounts?per_page=1", token);
  if (
    accountData.success &&
    Array.isArray(accountData.result) &&
    accountData.result.length > 0
  ) {
    return (accountData.result[0] as { id: string }).id;
  }
  return null;
}

/**
 * Deploy a Cloudflare Worker to proxy requests with correct Host header
 */
async function deployProxyWorker(
  token: string,
  accountId: string,
  zoneId: string,
  domain: string,
  convexDeployment: string,
): Promise<boolean> {
  const workerName = `convex-proxy-${domain.replace(/\./g, "-")}`;
  const convexSite = `${convexDeployment}.convex.site`;

  // Worker script that rewrites Host header
  const workerScript = `
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const convexUrl = new URL(url.pathname + url.search, "https://${convexSite}");
    
    const headers = new Headers(request.headers);
    headers.set("Host", "${convexSite}");
    
    const modifiedRequest = new Request(convexUrl.toString(), {
      method: request.method,
      headers: headers,
      body: request.body,
    });
    
    return fetch(modifiedRequest);
  },
};
`.trim();

  // Create/update the worker script
  const scriptData = await cfApi(
    `/accounts/${accountId}/workers/scripts/${workerName}`,
    token,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/javascript",
      },
      body: workerScript,
    },
  );

  if (!scriptData.success) {
    return false;
  }

  // Create a route for the worker
  // First, check if route already exists
  const existingRoutes = await cfApi(
    `/zones/${zoneId}/workers/routes`,
    token,
  );

  const routePattern = `${domain}/*`;
  let routeExists = false;

  if (existingRoutes.success && Array.isArray(existingRoutes.result)) {
    for (const route of existingRoutes.result as Array<{
      id: string;
      pattern: string;
      script: string;
    }>) {
      if (route.pattern === routePattern) {
        // Update existing route
        await cfApi(`/zones/${zoneId}/workers/routes/${route.id}`, token, {
          method: "PUT",
          body: JSON.stringify({ pattern: routePattern, script: workerName }),
        });
        routeExists = true;
        break;
      }
    }
  }

  if (!routeExists) {
    // Create new route
    const routeData = await cfApi(`/zones/${zoneId}/workers/routes`, token, {
      method: "POST",
      body: JSON.stringify({ pattern: routePattern, script: workerName }),
    });
    if (!routeData.success) {
      return false;
    }
  }

  return true;
}

/**
 * Save credentials to .env.local
 */
function saveToEnv(zoneId: string, apiToken: string, domain: string): void {
  const envFile = ".env.local";
  const newVars = `
# Cloudflare CDN Configuration (added by setup-cloudflare)
CLOUDFLARE_ZONE_ID=${zoneId}
CLOUDFLARE_API_TOKEN=${apiToken}
CLOUDFLARE_DOMAIN=${domain}
`;

  if (existsSync(envFile)) {
    // Check if vars already exist
    const content = readFileSync(envFile, "utf-8");
    if (content.includes("CLOUDFLARE_ZONE_ID")) {
      // Replace existing
      const updated = content
        .replace(/CLOUDFLARE_ZONE_ID=.*/g, `CLOUDFLARE_ZONE_ID=${zoneId}`)
        .replace(/CLOUDFLARE_API_TOKEN=.*/g, `CLOUDFLARE_API_TOKEN=${apiToken}`)
        .replace(/CLOUDFLARE_DOMAIN=.*/g, `CLOUDFLARE_DOMAIN=${domain}`);
      writeFileSync(envFile, updated);
    } else {
      appendFileSync(envFile, newVars);
    }
  } else {
    writeFileSync(envFile, newVars.trim() + "\n");
  }
}

/**
 * Save Cloudflare Worker name to .env.local
 */
function saveWorkerNameToEnv(workerName: string): void {
  const envFile = ".env.local";
  const newVar = `CLOUDFLARE_WORKER_NAME=${workerName}`;

  if (existsSync(envFile)) {
    const content = readFileSync(envFile, "utf-8");
    if (content.includes("CLOUDFLARE_WORKER_NAME")) {
      // Replace existing
      const updated = content.replace(
        /CLOUDFLARE_WORKER_NAME=.*/g,
        newVar,
      );
      writeFileSync(envFile, updated);
    } else {
      appendFileSync(envFile, `\n# Cloudflare Worker Name\n${newVar}\n`);
    }
  } else {
    writeFileSync(envFile, `# Cloudflare Worker Name\n${newVar}\n`);
  }
}

/**
 * Get the workers.dev subdomain for an account
 */
async function getWorkerSubdomain(
  accountId: string,
  token: string,
): Promise<string | null> {
  const data = await cfApi(
    `/accounts/${accountId}/workers/subdomain`,
    token,
  );
  if (data.success && data.result) {
    return (data.result as { subdomain: string }).subdomain;
  }
  return null;
}

/**
 * Run the Cloudflare Workers setup flow
 */
async function runWorkersSetup(token: string): Promise<void> {
  log("");
  log("===============================================================");
  log("  Cloudflare Workers Setup");
  log("===============================================================");
  log("");
  log("Cloudflare Workers with Static Assets serves your static files");
  log("directly from edge, without needing Convex storage for assets.");
  log("");

  // Get account ID
  const accountId = await getAccountId(token);
  if (!accountId) {
    error("Could not get Cloudflare account ID.");
    log("Your API token may not have account-level permissions.");
    log("");
    log("Create an API token with 'Workers Scripts: Edit' permission at:");
    log("  https://dash.cloudflare.com/profile/api-tokens");
    rl.close();
    process.exit(1);
  }

  // Get workers.dev subdomain
  const subdomain = await getWorkerSubdomain(accountId, token);

  // Get worker name
  log("Step 1: Setting up Worker name...");
  log("");

  let workerName = await prompt("Enter a worker name (e.g., my-app): ");
  if (!workerName) {
    workerName = "convex-app";
  }

  // Sanitize worker name (lowercase, alphanumeric and hyphens only)
  workerName = workerName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  info(`Worker "${workerName}" will be created on first deploy.`);
  log("  (Workers are automatically created when you deploy)");

  // Save to .env.local
  log("");
  log("Step 2: Saving configuration...");
  saveWorkerNameToEnv(workerName);
  success("Saved CLOUDFLARE_WORKER_NAME to .env.local");

  // Offer to deploy
  log("");
  log("Step 3: Deploy static files...");
  log("");
  const shouldDeploy = await promptYesNo(
    "Would you like to build and deploy static files now?",
  );

  if (shouldDeploy) {
    log("");
    log("Building app...");
    const buildResult = spawnSync("npm", ["run", "build"], { stdio: "inherit" });

    if (buildResult.status === 0) {
      log("");
      log("Deploying to Cloudflare Workers...");
      const deployResult = spawnSync(
        "npx",
        [
          "@get-convex/self-static-hosting",
          "upload",
          "--cloudflare-workers",
          "--worker-name",
          workerName,
          "--prod",
        ],
        { stdio: "inherit" },
      );

      if (deployResult.status === 0) {
        success("Deployment complete!");
      } else {
        warn("Deployment failed. Try running manually:");
        log(`  npx @get-convex/self-static-hosting upload --cloudflare-workers --worker-name ${workerName} --prod`);
      }
    } else {
      warn("Build failed. Please fix any errors and run:");
      log(`  npm run build`);
      log(`  npx @get-convex/self-static-hosting upload --cloudflare-workers --worker-name ${workerName} --prod`);
    }
  }

  // Build the URL
  const workerUrl = subdomain
    ? `https://${workerName}.${subdomain}.workers.dev`
    : `https://${workerName}.workers.dev`;

  // Done!
  log("");
  log("===============================================================");
  success("Cloudflare Workers setup complete!");
  log("");
  log("Your configuration:");
  log(`  Worker: ${workerName}`);
  log(`  URL: ${workerUrl}`);
  log("");
  log("To add a custom domain, go to:");
  log("  https://dash.cloudflare.com -> Workers & Pages -> your worker -> Settings -> Triggers");
  log("");
  log("To deploy in the future, run:");
  log(`  npx @get-convex/self-static-hosting upload --build --prod --cloudflare-workers`);
  log("");
  log("Or add to package.json:");
  log(`  "deploy:static": "npx @get-convex/self-static-hosting upload --build --prod --cloudflare-workers"`);
  log("");

  rl.close();
}

async function main(): Promise<void> {
  log("");
  log("☁️  Cloudflare Setup Wizard");
  log("═══════════════════════════════════════════════════════════");
  log("");

  // Step 1: Check for wrangler
  log("Step 1: Checking for Cloudflare CLI (wrangler)...");
  if (!commandExists("wrangler") && !commandExists("npx")) {
    error("Neither wrangler nor npx found. Please install Node.js first.");
    process.exit(1);
  }

  // Step 2: Check authentication
  log("");
  log("Step 2: Checking Cloudflare authentication...");

  let loggedIn = isWranglerLoggedIn();
  if (!loggedIn) {
    info("Not logged in to Cloudflare.");
    const shouldLogin = await promptYesNo("Would you like to login now?");
    if (!shouldLogin) {
      log(
        "Run 'npx wrangler login' when you're ready, then run this command again.",
      );
      rl.close();
      process.exit(0);
    }

    log("");
    log("Opening browser for Cloudflare login...");
    spawnSync("npx", ["wrangler", "login"], { stdio: "inherit" });

    // Verify login succeeded
    loggedIn = isWranglerLoggedIn();
    if (!loggedIn) {
      error("Login failed. Please try again.");
      rl.close();
      process.exit(1);
    }
  }
  success("Logged in to Cloudflare");

  // Try to get OAuth token from wrangler config for API calls
  let token = getWranglerToken();
  if (!token) {
    warn("Could not read wrangler OAuth token from config file.");
    log("This may happen with newer versions of wrangler.");
    log("");
    log("Please create an API token manually:");
    log("  1. Go to https://dash.cloudflare.com/profile/api-tokens");
    log("  2. Click 'Create Token'");
    log(
      "  3. Use 'Edit zone DNS' template (or custom with Zone:Read, DNS:Edit, Cache Purge)",
    );
    log("");
    token = await prompt("Paste your API token here: ");
    if (!token) {
      error("API token is required to continue.");
      rl.close();
      process.exit(1);
    }
  }

  // Step 3: Choose hosting mode
  log("");
  log("Step 3: Choose hosting mode...");
  log("");
  log("How would you like to host your static files?");
  log("");
  log("  1. Cloudflare Workers (recommended)");
  log("     - Files served directly from Cloudflare edge");
  log("     - No Convex storage costs for static assets");
  log("     - Built-in SPA routing support");
  log("");
  log("  2. Convex Storage + Cloudflare CDN");
  log("     - Files stored in Convex, cached by Cloudflare");
  log("     - Requires Worker proxy for Host header rewriting");
  log("     - Good if you want everything in Convex");
  log("");

  const modeChoice = await prompt("Select mode [1-2] (default: 1): ");
  const useWorkers = modeChoice !== "2";

  if (useWorkers) {
    // Run Workers setup flow
    await runWorkersSetup(token);
    return;
  }

  // Continue with Worker proxy setup (original flow)
  log("");
  log("Setting up Convex Storage + Cloudflare CDN...");

  // Step 4: Get Convex PRODUCTION site URL
  log("");
  log("Step 4: Getting your Convex PRODUCTION deployment URL...");

  // First try to get it automatically from convex CLI
  let convexSiteUrl = getConvexProdUrl();

  if (convexSiteUrl) {
    const convexHostnamePreview = convexSiteUrl
      .replace("https://", "")
      .replace("http://", "")
      .split("/")[0];
    success(`Found production deployment: ${convexHostnamePreview}`);
  } else {
    // Fall back to env files
    convexSiteUrl = getConvexSiteUrl(true);
    if (convexSiteUrl) {
      const convexHostnamePreview = convexSiteUrl
        .replace("https://", "")
        .replace("http://", "")
        .split("/")[0];
      log(`Found in env files: ${convexHostnamePreview}`);
      warn("This may be a development URL.");
      const useFound = await promptYesNo("Is this your PRODUCTION deployment?");
      if (!useFound) {
        convexSiteUrl = null;
      }
    }
  }

  if (!convexSiteUrl) {
    log("");
    log("Enter your production Convex site URL.");
    log("  Format: https://your-deployment.convex.site");
    log("  (Run 'npx convex dashboard --prod' to find it)");
    log("");
    const manualUrl = await prompt("Production Convex URL: ");
    if (!manualUrl) {
      error(
        "Convex URL is required. Run 'npx convex deploy' first to deploy to production.",
      );
      rl.close();
      process.exit(1);
    }
    convexSiteUrl = manualUrl.includes(".convex.site")
      ? manualUrl
      : manualUrl.replace(".convex.cloud", ".convex.site");
  }

  // Extract just the hostname
  const convexHostname = convexSiteUrl
    .replace("https://", "")
    .replace("http://", "")
    .split("/")[0];
  success(`Production Convex site: ${convexHostname}`);

  // Step 5: Select or add domain
  log("");
  log("Step 5: Selecting your domain...");

  const zones = await listZones(token);
  let selectedZone: { id: string; name: string } | null = null;

  if (zones.length > 0) {
    log("");
    log("Your domains in Cloudflare:");
    zones.forEach((zone, i) => {
      log(`  ${i + 1}. ${zone.name} (${zone.status})`);
    });
    log(`  ${zones.length + 1}. Add a new domain`);
    log("");

    const choice = await prompt(`Select a domain [1-${zones.length + 1}]: `);
    const choiceNum = parseInt(choice, 10);

    if (choiceNum >= 1 && choiceNum <= zones.length) {
      selectedZone = zones[choiceNum - 1];
    }
  }

  if (!selectedZone) {
    log("");
    log("To add a new domain to Cloudflare:");
    log("  1. Go to https://dash.cloudflare.com/");
    log("  2. Click 'Onboard a domain' (or 'Buy a domain')");
    log("  3. Enter your domain and follow the setup wizard");
    log("  4. Update your domain's nameservers to Cloudflare's");
    log("  5. Run this command again once the domain is active");
    log("");
    const domainName = await prompt("Or enter a domain you've already added: ");
    if (domainName) {
      const matchingZone = zones.find(
        (z) => z.name.toLowerCase() === domainName.toLowerCase(),
      );
      if (matchingZone) {
        selectedZone = matchingZone;
      } else {
        error(`Domain '${domainName}' not found in your Cloudflare account.`);
        rl.close();
        process.exit(1);
      }
    } else {
      rl.close();
      process.exit(0);
    }
  }

  success(`Selected domain: ${selectedZone.name}`);

  // Step 6: Configure DNS
  log("");
  log("Step 6: Configuring DNS...");

  const useSubdomain = await promptYesNo(
    `Use a subdomain (e.g., app.${selectedZone.name})? Otherwise will use root domain (${selectedZone.name}).`,
    false,
  );

  let recordName: string;
  let fullDomain: string;
  if (useSubdomain) {
    const subdomain = await prompt("Enter subdomain (e.g., app, www): ");
    recordName = subdomain || "app";
    fullDomain = `${recordName}.${selectedZone.name}`;
  } else {
    recordName = "@";
    fullDomain = selectedZone.name;
  }

  log(`Creating CNAME record: ${fullDomain} → ${convexHostname}`);

  const dnsSuccess = await createDnsRecord(token, selectedZone.id, {
    type: "CNAME",
    name: recordName === "@" ? selectedZone.name : recordName,
    content: convexHostname,
    proxied: true, // Enable Cloudflare proxy (orange cloud)
  });

  // Track if user provides a custom API token (will reuse for cache purging)
  let userProvidedApiToken: string | null = null;

  if (dnsSuccess) {
    success(`DNS configured: ${fullDomain} → ${convexHostname}`);
  } else {
    warn("Could not create DNS record automatically.");
    log("The wrangler OAuth token doesn't have DNS edit permissions.");
    log("");
    log("Create an API token at:");
    log(`  https://dash.cloudflare.com/profile/api-tokens`);
    log("");
    log("Create a custom token with these permissions:");
    log("  - Zone:DNS:Edit (for creating the CNAME record)");
    log("  - Zone:Zone:Read");
    log("  - Zone:Cache Purge:Purge (for cache invalidation on deploy)");
    log("  - Account:Workers Scripts:Edit (for deploying the proxy worker)");
    log("  - Zone:SSL and Certificates:Edit (for SSL mode)");
    log("");
    log(`Limit the token to zone: ${selectedZone.name}`);
    log("");
    const dnsToken = await prompt("Paste your API token here: ");

    if (dnsToken) {
      log("");
      log(`Retrying DNS record creation...`);
      const retrySuccess = await createDnsRecord(dnsToken, selectedZone.id, {
        type: "CNAME",
        name: recordName === "@" ? selectedZone.name : recordName,
        content: convexHostname,
        proxied: true,
      });

      if (retrySuccess) {
        success(`DNS configured: ${fullDomain} → ${convexHostname}`);
        // Save token for reuse in cache purging step
        userProvidedApiToken = dnsToken;
      } else {
        warn("Still could not create DNS record.");
        log("Please add it manually in the Cloudflare dashboard:");
        log(`  https://dash.cloudflare.com/${selectedZone.id}/dns/records`);
        log("");
        log(`  Type: CNAME`);
        log(`  Name: ${recordName}`);
        log(`  Target: ${convexHostname}`);
        log(`  Proxy: Enabled (orange cloud)`);
      }
    } else {
      log("");
      log("Please add this record manually in Cloudflare dashboard:");
      log(`  https://dash.cloudflare.com/${selectedZone.id}/dns/records`);
      log("");
      log(`  Type: CNAME`);
      log(`  Name: ${recordName}`);
      log(`  Target: ${convexHostname}`);
      log(`  Proxy: Enabled (orange cloud)`);
    }
  }

  // Step 7: Deploy Cloudflare Worker for Host header rewriting
  log("");
  log("Step 7: Deploying Cloudflare Worker...");
  info("This is required because Convex validates the Host header.");
  log("");

  // Extract deployment name from convexHostname (e.g., "different-pika-115" from "different-pika-115.convex.site")
  const convexDeployment = convexHostname.replace(".convex.site", "");

  // Try with current token first
  let activeToken = userProvidedApiToken || token;
  let accountId = await getAccountId(activeToken);
  let workerDeployed = false;
  let sslChecked = false;

  // If we can't get account ID with current token, prompt for a more powerful one
  if (!accountId) {
    warn("Current token doesn't have account-level permissions.");
    log("");
    log("To deploy the Worker and configure SSL, you need an API token with:");
    log("  - Account:Workers Scripts:Edit");
    log("  - Zone:SSL and Certificates:Read/Edit");
    log("");
    log("Create one at: https://dash.cloudflare.com/profile/api-tokens");
    log("");
    const workerToken = await prompt("Paste API token (or press Enter to skip): ");
    
    if (workerToken) {
      activeToken = workerToken;
      accountId = await getAccountId(activeToken);
      // Also save for cache purging later
      if (!userProvidedApiToken) {
        userProvidedApiToken = workerToken;
      }
    }
  }

  if (accountId) {
    const workerSuccess = await deployProxyWorker(
      activeToken,
      accountId,
      selectedZone.id,
      fullDomain,
      convexDeployment,
    );

    if (workerSuccess) {
      success(`Worker deployed: convex-proxy-${fullDomain.replace(/\./g, "-")}`);
      workerDeployed = true;
    } else {
      warn("Could not deploy worker automatically.");
    }
  }

  if (!workerDeployed) {
    warn("Worker not deployed. You need to create it manually:");
    log("");
    log("1. Go to: https://dash.cloudflare.com → Workers & Pages → Create");
    log("2. Create a Worker with this code:");
    log("");
    log("---");
    log(`export default {`);
    log(`  async fetch(request) {`);
    log(`    const url = new URL(request.url);`);
    log(`    const convexUrl = new URL(url.pathname + url.search, "https://${convexHostname}");`);
    log(`    const headers = new Headers(request.headers);`);
    log(`    headers.set("Host", "${convexHostname}");`);
    log(`    return fetch(convexUrl.toString(), { method: request.method, headers, body: request.body });`);
    log(`  },`);
    log(`};`);
    log("---");
    log("");
    log(`3. Add a route: ${fullDomain}/* → your-worker-name`);
    log(`   (in Workers & Pages → your worker → Settings → Triggers → Routes)`);
  }

  // Step 8: Check and set SSL mode
  log("");
  log("Step 8: Checking SSL/TLS mode...");

  const currentSslMode = await getSslMode(activeToken, selectedZone.id);

  if (currentSslMode) {
    sslChecked = true;
    if (currentSslMode === "flexible") {
      warn(`SSL mode is "${currentSslMode}" - this will cause redirect loops!`);
      log("Changing to \"full\"...");

      const sslSuccess = await setSslMode(activeToken, selectedZone.id, "full");
      if (sslSuccess) {
        success("SSL mode set to \"full\"");
      } else {
        error("Could not change SSL mode automatically.");
        log("Please change it manually:");
        log(`  1. Go to https://dash.cloudflare.com → ${selectedZone.name} → SSL/TLS`);
        log("  2. Set encryption mode to \"Full\"");
      }
    } else if (currentSslMode === "full" || currentSslMode === "strict") {
      success(`SSL mode is "${currentSslMode}" (OK)`);
    } else {
      info(`SSL mode is "${currentSslMode}"`);
      log("If you experience redirect loops, change it to \"Full\" or \"Full (strict)\"");
    }
  }

  if (!sslChecked) {
    warn("Could not check SSL mode.");
    log("");
    log("IMPORTANT: Make sure SSL/TLS mode is set to \"Full\" (not \"Flexible\")!");
    log("Otherwise you will get redirect loops.");
    log("");
    log(`Go to: https://dash.cloudflare.com → ${selectedZone.name} → SSL/TLS → Overview`);
    log("Set encryption mode to \"Full\" or \"Full (strict)\"");
  }

  // Step 9: Get API token for cache purging
  log("");
  log("Step 9: Setting up cache purge token...");

  let finalApiToken: string;

  // Reuse user-provided token if they already gave us one with cache purge permissions
  if (userProvidedApiToken) {
    success("Using your API token for cache purging");
    finalApiToken = userProvidedApiToken;
  } else {
    // Try to create one automatically
    const apiToken = await createApiToken(
      token,
      selectedZone.name,
      selectedZone.id,
    );

    if (apiToken) {
      success("API token created for cache purging");
      finalApiToken = apiToken;
    } else {
      warn("Could not create API token automatically.");
      log("Please create one manually:");
      log("  1. Go to https://dash.cloudflare.com/profile/api-tokens");
      log("  2. Click 'Create Token'");
      log("  3. Use 'Custom token' template");
      log("  4. Add permission: Zone → Cache Purge → Purge");
      log(`  5. Limit to zone: ${selectedZone.name}`);
      log("");
      finalApiToken = await prompt("Paste your API token here: ");
      if (!finalApiToken) {
        error("API token is required for cache purging.");
        rl.close();
        process.exit(1);
      }
    }
  }

  // Step 10: Save to .env.local
  log("");
  log("Step 10: Saving configuration...");

  saveToEnv(selectedZone.id, finalApiToken, fullDomain);
  success("Credentials saved to .env.local");

  // Step 11: Check production deployment and offer to deploy
  log("");
  log("Step 11: Checking production deployment...");

  // Check if Convex backend is deployed to production
  const hasProdDeployment = getConvexProdUrl() !== null;

  if (!hasProdDeployment) {
    warn("No Convex production deployment detected.");
    const shouldDeploy = await promptYesNo(
      "Would you like to deploy your Convex backend to production now?",
    );
    if (shouldDeploy) {
      log("");
      log("Deploying Convex backend to production...");
      spawnSync("npx", ["convex", "deploy"], { stdio: "inherit" });
      success("Convex backend deployed to production!");
    } else {
      log("");
      info("Remember to deploy your Convex backend first:");
      log("  npx convex deploy");
    }
  } else {
    success("Convex production deployment found");
  }

  // Step 12: Check if static files have been deployed
  log("");
  log("Step 12: Checking static files deployment...");

  const hasStaticFiles = hasStaticDeployment();

  if (!hasStaticFiles) {
    warn("No static files deployed yet.");
    const shouldDeployStatic = await promptYesNo(
      "Would you like to build and deploy static files now?",
    );
    if (shouldDeployStatic) {
      log("");
      log("Building app...");
      const buildResult = spawnSync("npm", ["run", "build"], { stdio: "inherit" });
      
      if (buildResult.status === 0) {
        log("");
        log("Uploading static files to production...");
        spawnSync("npm", ["run", "deploy:static"], { stdio: "inherit" });
        success("Static files deployed!");
      } else {
        warn("Build failed. Please fix any errors and run:");
        log("  npm run build && npm run deploy:static");
      }
    } else {
      log("");
      info("To deploy static files later, run:");
      log("  npm run build && npm run deploy:static");
    }
  } else {
    success("Static files already deployed");
  }

  // Done!
  log("");
  log("═══════════════════════════════════════════════════════════");
  success("Cloudflare setup complete!");
  log("");
  log("Your configuration:");
  log(`  Domain: ${fullDomain}`);
  log(`  Zone ID: ${selectedZone.id}`);
  log(`  Proxied: Yes (Cloudflare CDN enabled)`);
  log("");
  log("Your site should be live at:");
  log(`  https://${fullDomain}`);
  log("");
  log("Note: DNS propagation may take a few minutes.");
  log("Cache will be automatically purged on each deploy.");
  log("");

  rl.close();
}

main().catch((err) => {
  error(`Setup failed: ${err}`);
  rl.close();
  process.exit(1);
});
