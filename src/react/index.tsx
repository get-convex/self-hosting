"use client";

import { useQuery } from "convex/react";
import { useState, useMemo, type CSSProperties, type JSX } from "react";
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
export function useDeploymentUpdates(
  getCurrentDeployment: FunctionReference<"query", "public", Record<string, never>, DeploymentInfo>,
) {
  const deployment = useQuery(getCurrentDeployment, {});
  const [initialDeploymentId, setInitialDeploymentId] = useState<string | null>(null);
  const [dismissedDeploymentId, setDismissedDeploymentId] = useState<string | null>(null);

  // Capture the initial deployment ID on first load
  // Using useState with functional update to avoid stale closure issues
  if (deployment && initialDeploymentId === null) {
    // This is safe - we're setting initial state based on first data load
    // It only runs once when deployment first becomes available
    setInitialDeploymentId(deployment.currentDeploymentId);
  }

  // Derive updateAvailable from current state
  const updateAvailable = useMemo(() => {
    if (!deployment || initialDeploymentId === null) {
      return false;
    }
    // Show update if deployment changed from initial AND user hasn't dismissed this one
    const hasNewDeployment = deployment.currentDeploymentId !== initialDeploymentId;
    const isDismissed = deployment.currentDeploymentId === dismissedDeploymentId;
    return hasNewDeployment && !isDismissed;
  }, [deployment, initialDeploymentId, dismissedDeploymentId]);

  const reload = () => {
    window.location.reload();
  };

  const dismiss = () => {
    if (deployment) {
      setDismissedDeploymentId(deployment.currentDeploymentId);
    }
  };

  return {
    /** True when a new deployment is available */
    updateAvailable,
    /** Reload the page to get the new version */
    reload,
    /** Dismiss the update notification (until next deploy) */
    dismiss,
    /** The current deployment info (or null if not yet loaded) */
    deployment,
  };
}

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
export function UpdateBanner({
  getCurrentDeployment,
  message = "A new version is available!",
  buttonText = "Reload",
  dismissable = true,
  className,
  style,
}: {
  getCurrentDeployment: FunctionReference<"query", "public", Record<string, never>, DeploymentInfo>;
  message?: string;
  buttonText?: string;
  dismissable?: boolean;
  className?: string;
  style?: CSSProperties;
}): JSX.Element | null {
  const { updateAvailable, reload, dismiss } = useDeploymentUpdates(getCurrentDeployment);

  if (!updateAvailable) return null;

  const defaultStyle: CSSProperties = {
    position: "fixed",
    bottom: "1rem",
    right: "1rem",
    backgroundColor: "#1a1a2e",
    color: "#fff",
    padding: "1rem 1.5rem",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    zIndex: 9999,
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "14px",
    ...style,
  };

  const buttonStyle: CSSProperties = {
    backgroundColor: "#4f46e5",
    color: "#fff",
    border: "none",
    padding: "0.5rem 1rem",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: 500,
  };

  const dismissStyle: CSSProperties = {
    background: "none",
    border: "none",
    color: "#888",
    cursor: "pointer",
    padding: "0.25rem",
    fontSize: "18px",
    lineHeight: 1,
  };

  return (
    <div className={className} style={defaultStyle}>
      <span>{message}</span>
      <button onClick={reload} style={buttonStyle}>
        {buttonText}
      </button>
      {dismissable && (
        <button onClick={dismiss} style={dismissStyle} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
