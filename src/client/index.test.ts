import { describe, expect, test } from "vitest";
import { exposeUploadApi, getMimeType } from "./index.js";
import { anyApi, type ApiFromModules } from "convex/server";
import { components, initConvexTest } from "./setup.test.js";

export const { generateUploadUrl, recordAsset, gcOldAssets, listAssets } =
  exposeUploadApi(components.selfHosting);

const testApi = (
  anyApi as unknown as ApiFromModules<{
    "index.test": {
      generateUploadUrl: typeof generateUploadUrl;
      recordAsset: typeof recordAsset;
      gcOldAssets: typeof gcOldAssets;
      listAssets: typeof listAssets;
    };
  }>
)["index.test"];

describe("client tests", () => {
  test("should expose upload API functions", async () => {
    const t = initConvexTest();

    // Test generateUploadUrl
    const uploadUrl = await t.mutation(testApi.generateUploadUrl, {});
    expect(uploadUrl).toBeDefined();
    expect(typeof uploadUrl).toBe("string");
  });

  test("should list empty assets initially", async () => {
    const t = initConvexTest();

    const assets = await t.query(testApi.listAssets, {});
    expect(assets).toHaveLength(0);
  });

  test("gc should return 0 with no assets", async () => {
    const t = initConvexTest();

    const deleted = await t.mutation(testApi.gcOldAssets, {
      currentDeploymentId: "test-deployment",
    });
    expect(deleted).toBe(0);
  });
});

describe("getMimeType", () => {
  test("returns correct MIME types for common extensions", () => {
    expect(getMimeType("/index.html")).toBe("text/html; charset=utf-8");
    expect(getMimeType("/assets/main.js")).toBe(
      "application/javascript; charset=utf-8",
    );
    expect(getMimeType("/styles/app.css")).toBe("text/css; charset=utf-8");
    expect(getMimeType("/data.json")).toBe("application/json; charset=utf-8");
    expect(getMimeType("/image.png")).toBe("image/png");
    expect(getMimeType("/photo.jpg")).toBe("image/jpeg");
    expect(getMimeType("/icon.svg")).toBe("image/svg+xml");
    expect(getMimeType("/favicon.ico")).toBe("image/x-icon");
    expect(getMimeType("/font.woff2")).toBe("font/woff2");
  });

  test("returns octet-stream for unknown extensions", () => {
    expect(getMimeType("/file.xyz")).toBe("application/octet-stream");
    expect(getMimeType("/unknown")).toBe("application/octet-stream");
  });
});
