declare const _default: import("convex/server").SchemaDefinition<{
    staticAssets: import("convex/server").TableDefinition<import("convex/values").VObject<{
        storageId?: import("convex/values").GenericId<"_storage"> | undefined;
        blobId?: string | undefined;
        path: string;
        contentType: string;
        deploymentId: string;
    }, {
        path: import("convex/values").VString<string, "required">;
        storageId: import("convex/values").VId<import("convex/values").GenericId<"_storage"> | undefined, "optional">;
        blobId: import("convex/values").VString<string | undefined, "optional">;
        contentType: import("convex/values").VString<string, "required">;
        deploymentId: import("convex/values").VString<string, "required">;
    }, "required", "storageId" | "path" | "contentType" | "deploymentId" | "blobId">, {
        by_path: ["path", "_creationTime"];
        by_deploymentId: ["deploymentId", "_creationTime"];
    }, {}, {}>;
    deploymentInfo: import("convex/server").TableDefinition<import("convex/values").VObject<{
        currentDeploymentId: string;
        deployedAt: number;
    }, {
        currentDeploymentId: import("convex/values").VString<string, "required">;
        deployedAt: import("convex/values").VFloat64<number, "required">;
    }, "required", "currentDeploymentId" | "deployedAt">, {}, {}, {}>;
}, true>;
export default _default;
//# sourceMappingURL=schema.d.ts.map