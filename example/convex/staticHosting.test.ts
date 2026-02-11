import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initConvexTest } from "./setup.test";
import { internal } from "./_generated/api";

describe("static hosting example (internal functions)", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  test("generateUploadUrl returns a URL", async () => {
    const t = initConvexTest();
    const uploadUrl = await t.mutation(internal.staticHosting.generateUploadUrl, {});
    expect(uploadUrl).toBeDefined();
    expect(typeof uploadUrl).toBe("string");
  });

  test("listAssets returns empty array initially", async () => {
    const t = initConvexTest();
    const assets = await t.query(internal.staticHosting.listAssets, {});
    expect(assets).toHaveLength(0);
  });

  test("gcOldAssets returns 0 with no assets", async () => {
    const t = initConvexTest();
    const result = await t.mutation(internal.staticHosting.gcOldAssets, {
      currentDeploymentId: "test-deployment",
    });
    expect(result.deleted).toBe(0);
    expect(result.blobIds).toHaveLength(0);
  });
});
