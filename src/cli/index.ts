#!/usr/bin/env node
/**
 * CLI entry point for @get-convex/self-static-hosting
 *
 * Commands:
 *   init     - Output integration instructions (LLM-friendly)
 *   upload   - Upload static files to Convex
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const command = process.argv[2];
const args = process.argv.slice(3);

if (command === "init") {
  // Run init command
  const initPath = join(__dirname, "init.js");
  await import(initPath);
} else if (command === "upload" || !command || command === "--help" || command === "-h") {
  // Run upload command (default)
  const uploadPath = join(__dirname, "upload.js");
  const uploadArgs = command === "upload" ? args : process.argv.slice(2);
  
  // Re-execute with upload script
  const child = spawn(process.execPath, [uploadPath, ...uploadArgs], {
    stdio: "inherit",
  });
  
  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
} else {
  console.error(`Unknown command: ${command}`);
  console.error("");
  console.error("Available commands:");
  console.error("  init     Output integration instructions for your LLM");
  console.error("  upload   Upload static files to Convex storage");
  console.error("");
  console.error("Examples:");
  console.error("  npx @get-convex/self-static-hosting init");
  console.error("  npx @get-convex/self-static-hosting upload --dist ./dist");
  process.exit(1);
}
