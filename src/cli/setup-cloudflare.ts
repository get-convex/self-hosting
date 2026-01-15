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
 * Get the Convex site URL from .env.local
 */
function getConvexSiteUrl(): string | null {
  const envFiles = [".env.local", ".env"];
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
 * Get API token from wrangler config
 */
function getWranglerToken(): string | null {
  const configPath = join(homedir(), ".wrangler", "config", "default.toml");
  if (existsSync(configPath)) {
    const content = readFileSync(configPath, "utf-8");
    const match = content.match(/oauth_token\s*=\s*"([^"]+)"/);
    if (match) {
      return match[1];
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

  let token = getWranglerToken();
  if (!token) {
    info("Not logged in to Cloudflare.");
    const shouldLogin = await promptYesNo("Would you like to login now?");
    if (!shouldLogin) {
      log("Run 'npx wrangler login' when you're ready, then run this command again.");
      rl.close();
      process.exit(0);
    }

    log("");
    log("Opening browser for Cloudflare login...");
    spawnSync("npx", ["wrangler", "login"], { stdio: "inherit" });

    token = getWranglerToken();
    if (!token) {
      error("Login failed. Please try again.");
      rl.close();
      process.exit(1);
    }
  }
  success("Logged in to Cloudflare");

  // Step 3: Get Convex site URL
  log("");
  log("Step 3: Getting your Convex deployment URL...");

  let convexSiteUrl = getConvexSiteUrl();
  if (!convexSiteUrl) {
    warn("Could not find CONVEX_URL in .env.local");
    const manualUrl = await prompt(
      "Enter your Convex site URL (e.g., happy-animal-123.convex.site): ",
    );
    if (!manualUrl) {
      error("Convex URL is required. Run 'npx convex dev' first to set up your project.");
      rl.close();
      process.exit(1);
    }
    convexSiteUrl = manualUrl.includes(".convex.site")
      ? manualUrl
      : `${manualUrl}.convex.site`;
  }

  // Extract just the hostname
  const convexHostname = convexSiteUrl
    .replace("https://", "")
    .replace("http://", "")
    .split("/")[0];
  success(`Convex site: ${convexHostname}`);

  // Step 4: Select or add domain
  log("");
  log("Step 4: Selecting your domain...");

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
    log("  2. Click 'Add a Site'");
    log("  3. Enter your domain and follow the setup wizard");
    log("  4. Update your domain's nameservers to Cloudflare's");
    log("  5. Run this command again once the domain is active");
    log("");
    const domainName = await prompt(
      "Or enter a domain you've already added: ",
    );
    if (domainName) {
      const matchingZone = zones.find((z) => z.name === domainName);
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

  // Step 5: Configure DNS
  log("");
  log("Step 5: Configuring DNS...");

  const useSubdomain = await promptYesNo(
    `Use a subdomain (e.g., app.${selectedZone.name})? Otherwise will use root domain.`,
    true,
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

  if (dnsSuccess) {
    success(`DNS configured: ${fullDomain} → ${convexHostname}`);
  } else {
    warn("Could not create DNS record automatically.");
    log(`Please add this record manually in Cloudflare dashboard:`);
    log(`  Type: CNAME`);
    log(`  Name: ${recordName}`);
    log(`  Target: ${convexHostname}`);
    log(`  Proxy: Enabled (orange cloud)`);
  }

  // Step 6: Create API token for cache purging
  log("");
  log("Step 6: Creating API token for cache purging...");

  const apiToken = await createApiToken(token, selectedZone.name, selectedZone.id);
  let finalApiToken: string;

  if (apiToken) {
    success("API token created");
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

  // Step 7: Save to .env.local
  log("");
  log("Step 7: Saving configuration...");

  saveToEnv(selectedZone.id, finalApiToken, fullDomain);
  success("Credentials saved to .env.local");

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
  log("Next steps:");
  log("  1. Wait a few minutes for DNS to propagate");
  log(`  2. Deploy your app: npm run deploy:static`);
  log(`  3. Visit: https://${fullDomain}`);
  log("");
  log("Cache will be automatically purged on each deploy.");
  log("");

  rl.close();
}

main().catch((err) => {
  error(`Setup failed: ${err}`);
  rl.close();
  process.exit(1);
});
