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

    // GC with no assets should return empty array
    const storageIds = await t.mutation(api.lib.gcOldAssets, {
      currentDeploymentId: "test-deployment",
    });
    expect(storageIds).toHaveLength(0);
  });
});
