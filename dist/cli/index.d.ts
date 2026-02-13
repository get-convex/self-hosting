#!/usr/bin/env node
/**
 * CLI for Convex Self Hosting
 *
 * Commands:
 *   deploy              One-shot deployment (Convex backend + static files)
 *   upload              Upload static files to Convex storage
 *   next-build          Build Next.js app and prepare for Convex deployment
 *   init                Print setup instructions
 */
declare const command: string;
declare function main(): Promise<void>;
declare function printHelp(): void;
declare function printInitInstructions(): void;
//# sourceMappingURL=index.d.ts.map