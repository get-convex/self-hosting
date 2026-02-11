/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */
import type { FunctionReference } from "convex/server";
/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> = {
    lib: {
        gcOldAssets: FunctionReference<"mutation", "internal", {
            currentDeploymentId: string;
        }, {
            blobIds: Array<string>;
            storageIds: Array<string>;
        }, Name>;
        generateUploadUrl: FunctionReference<"mutation", "internal", {}, string, Name>;
        getByPath: FunctionReference<"query", "internal", {
            path: string;
        }, {
            _creationTime: number;
            _id: string;
            blobId?: string;
            contentType: string;
            deploymentId: string;
            path: string;
            storageId?: string;
        } | null, Name>;
        getCurrentDeployment: FunctionReference<"query", "internal", {}, {
            _creationTime: number;
            _id: string;
            currentDeploymentId: string;
            deployedAt: number;
        } | null, Name>;
        listAssets: FunctionReference<"query", "internal", {
            limit?: number;
        }, Array<{
            _creationTime: number;
            _id: string;
            blobId?: string;
            contentType: string;
            deploymentId: string;
            path: string;
            storageId?: string;
        }>, Name>;
        recordAsset: FunctionReference<"mutation", "internal", {
            blobId?: string;
            contentType: string;
            deploymentId: string;
            path: string;
            storageId?: string;
        }, {
            oldBlobId: string | null;
            oldStorageId: string | null;
        }, Name>;
        setCurrentDeployment: FunctionReference<"mutation", "internal", {
            deploymentId: string;
        }, null, Name>;
    };
};
//# sourceMappingURL=component.d.ts.map