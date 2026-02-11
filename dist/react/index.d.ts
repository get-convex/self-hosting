import { type CSSProperties, type JSX } from "react";
import type { FunctionReference } from "convex/server";
type DeploymentInfo = {
    _id: string;
    _creationTime: number;
    currentDeploymentId: string;
    deployedAt: number;
} | null;
/**
 * Hook to detect when a new deployment is available.
 * Shows a prompt to the user instead of auto-reloading.
 *
 * @param getCurrentDeployment - The query function reference from exposeDeploymentQuery
 * @returns Object with update status and reload function
 *
 * @example
 * ```tsx
 * import { useDeploymentUpdates } from "@convex-dev/self-hosting/react";
 * import { api } from "../convex/_generated/api";
 *
 * function App() {
 *   const { updateAvailable, reload } = useDeploymentUpdates(
 *     api.staticHosting.getCurrentDeployment
 *   );
 *
 *   return (
 *     <div>
 *       {updateAvailable && (
 *         <div className="update-banner">
 *           A new version is available!
 *           <button onClick={reload}>Reload</button>
 *         </div>
 *       )}
 *       {/* rest of your app *\/}
 *     </div>
 *   );
 * }
 * ```
 */
export declare function useDeploymentUpdates(getCurrentDeployment: FunctionReference<"query", "public", Record<string, never>, DeploymentInfo>): {
    /** True when a new deployment is available */
    updateAvailable: boolean;
    /** Reload the page to get the new version */
    reload: () => void;
    /** Dismiss the update notification (until next deploy) */
    dismiss: () => void;
    /** The current deployment info (or null if not yet loaded) */
    deployment: DeploymentInfo | undefined;
};
/**
 * A ready-to-use update banner component.
 * Displays a notification when a new deployment is available.
 *
 * @example
 * ```tsx
 * import { UpdateBanner } from "@convex-dev/self-hosting/react";
 * import { api } from "../convex/_generated/api";
 *
 * function App() {
 *   return (
 *     <div>
 *       <UpdateBanner
 *         getCurrentDeployment={api.staticHosting.getCurrentDeployment}
 *       />
 *       {/* rest of your app *\/}
 *     </div>
 *   );
 * }
 * ```
 */
export declare function UpdateBanner({ getCurrentDeployment, message, buttonText, dismissable, className, style, }: {
    getCurrentDeployment: FunctionReference<"query", "public", Record<string, never>, DeploymentInfo>;
    message?: string;
    buttonText?: string;
    dismissable?: boolean;
    className?: string;
    style?: CSSProperties;
}): JSX.Element | null;
export {};
//# sourceMappingURL=index.d.ts.map