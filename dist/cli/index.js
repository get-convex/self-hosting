#!/usr/bin/env node
"use strict";
/**
 * CLI for Convex Self Hosting
 *
 * Commands:
 *   deploy              One-shot deployment (Convex backend + static files)
 *   upload              Upload static files to Convex storage
 *   next-build          Build Next.js app and prepare for Convex deployment
 *   init                Print setup instructions
 */
const command = process.argv[2];
async function main() {
    switch (command) {
        case "setup":
            await import("./setup.js");
            break;
        case "deploy":
            // Pass remaining args to deploy command
            process.argv.splice(2, 1);
            await import("./deploy.js");
            break;
        case "upload":
            // Pass remaining args to upload command
            process.argv.splice(2, 1);
            await import("./upload.js");
            break;
        case "next-build":
            // Pass remaining args to next-build command
            process.argv.splice(2, 1);
            await import("./next-build.js");
            break;
        case "init":
            printInitInstructions();
            break;
        case "--help":
        case "-h":
        case undefined:
            printHelp();
            break;
        default:
            console.error(`Unknown command: ${command}`);
            console.log("");
            printHelp();
            process.exit(1);
    }
}
function printHelp() {
    console.log(`
Convex Self Hosting CLI

Usage:
  npx @convex-dev/self-hosting <command> [options]

Commands:
  setup               Interactive setup wizard (creates files, configures deployment)
  deploy              One-shot deployment (Convex backend + static files)
  upload              Upload static files to Convex storage
  next-build          Build Next.js app and prepare for Convex deployment
  init                Print setup instructions for integration

Examples:
  # Interactive setup (recommended for first-time users)
  npx @convex-dev/self-hosting setup

  # One-shot deployment
  npx @convex-dev/self-hosting deploy

  # Upload only (no Convex backend deploy)
  npx @convex-dev/self-hosting upload --build --prod

Run '<command> --help' for more information on a specific command.
`);
}
function printInitInstructions() {
    console.log(`
📦 Convex Self Hosting

Quick Start:
  npx @convex-dev/self-hosting setup    # Interactive setup wizard

For LLMs:
  Read INTEGRATION.md in this package for complete integration instructions

Manual Setup:
  See README.md at https://github.com/get-convex/self-hosting#readme

This component hosts your static files in Convex storage and serves them via HTTP actions.
`);
}
main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map