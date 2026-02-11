/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api.js";
import { initConvexTest } from "./setup.test.js";

describe("component lib", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("can record and retrieve assets", async () => {
    const t = initConvexTest();

    // First upload a file to storage (mock with a fake storageId)
    const uploadUrl = await t.mutation(api.lib.generateUploadUrl, {});
    expect(uploadUrl).toBeDefined();
    expect(typeof uploadUrl).toBe("string");
  });

  test("can look up assets by path", async () => {
    const t = initConvexTest();

    // Look up a non-existent path
    const asset = await t.query(api.lib.getByPath, { path: "/index.html" });
    expect(asset).toBeNull();
  });

  test("can list assets", async () => {
    const t = initConvexTest();

    const assets = await t.query(api.lib.listAssets, {});
    expect(assets).toHaveLength(0);
  });

  test("gc removes old assets", async () => {
    const t = initConvexTest();

    // GC with no assets should return empty arrays
    const result = await t.mutation(api.lib.gcOldAssets, {
      currentDeploymentId: "test-deployment",
    });
    expect(result.storageIds).toHaveLength(0);
    expect(result.blobIds).toHaveLength(0);
  });

  test("recordAsset returns old IDs when replacing", async () => {
    const t = initConvexTest();

    // Record a new asset (no previous) - should return nulls
    const first = await t.mutation(api.lib.recordAsset, {
      path: "/test.js",
      blobId: "blob-123",
      contentType: "application/javascript; charset=utf-8",
      deploymentId: "deploy-1",
    });
    expect(first.oldStorageId).toBeNull();
    expect(first.oldBlobId).toBeNull();

    // Replace with a new blobId - should return the old one
    const second = await t.mutation(api.lib.recordAsset, {
      path: "/test.js",
      blobId: "blob-456",
      contentType: "application/javascript; charset=utf-8",
      deploymentId: "deploy-2",
    });
    expect(second.oldStorageId).toBeNull();
    expect(second.oldBlobId).toBe("blob-123");
  });

  test("gc returns blobIds for CDN assets", async () => {
    const t = initConvexTest();

    // Record a CDN asset
    await t.mutation(api.lib.recordAsset, {
      path: "/assets/main.js",
      blobId: "blob-abc",
      contentType: "application/javascript; charset=utf-8",
      deploymentId: "deploy-old",
    });

    // GC should return the blobId
    const result = await t.mutation(api.lib.gcOldAssets, {
      currentDeploymentId: "deploy-new",
    });
    expect(result.storageIds).toHaveLength(0);
    expect(result.blobIds).toEqual(["blob-abc"]);
  });

  test("asset with blobId can be looked up by path", async () => {
    const t = initConvexTest();

    await t.mutation(api.lib.recordAsset, {
      path: "/assets/style.css",
      blobId: "blob-xyz",
      contentType: "text/css; charset=utf-8",
      deploymentId: "deploy-1",
    });

    const asset = await t.query(api.lib.getByPath, {
      path: "/assets/style.css",
    });
    expect(asset).not.toBeNull();
    expect(asset!.blobId).toBe("blob-xyz");
    expect(asset!.storageId).toBeUndefined();
  });
});
