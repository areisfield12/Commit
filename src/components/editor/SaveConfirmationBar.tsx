"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

interface SaveConfirmationBarProps {
  visible: boolean;
  variant: "save" | "pr";
  branch: string;
  owner: string;
  repo: string;
  filePath: string;
  prNumber?: number;
  prUrl?: string;
  isDraft?: boolean;
  pendingCount?: number;
  onDismiss: () => void;
}

export function SaveConfirmationBar({
  visible,
  variant,
  branch,
  owner,
  repo,
  filePath,
  prNumber,
  prUrl,
  isDraft,
  pendingCount,
  onDismiss,
}: SaveConfirmationBarProps) {
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      // Trigger slide-down on next frame for CSS transition
      requestAnimationFrame(() => setShow(true));

      // Auto-hide after 6 seconds
      timerRef.current = setTimeout(() => {
        setShow(false);
        // Wait for slide-up animation to finish before calling onDismiss
        setTimeout(onDismiss, 150);
      }, 6000);

      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    } else {
      setShow(false);
    }
  }, [visible, onDismiss]);

  if (!visible && !show) return null;

  const isSave = variant === "save";
  const githubUrl = isSave
    ? `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`
    : prUrl ?? `https://github.com/${owner}/${repo}/pulls`;

  const draftSuffix =
    pendingCount && pendingCount > 0
      ? ` \u00b7 ${pendingCount} pending change${pendingCount === 1 ? "" : "s"}`
      : "";
  const message = isSave
    ? isDraft
      ? `Saved to your draft branch${draftSuffix}`
      : `Saved \u00b7 Committed to ${branch} \u00b7 just now`
    : `Pull request created \u00b7 PR #${prNumber ?? ""} open for review`;

  return (
    <div
      className="overflow-hidden flex-shrink-0"
      style={{
        maxHeight: show ? 36 : 0,
        transition: "max-height 150ms ease",
      }}
    >
      <div
        style={{
          height: 36,
          background: isSave
            ? "var(--color-success-subtle)"
            : "var(--color-accent-subtle)",
          borderBottom: `1px solid ${
            isSave
              ? "color-mix(in srgb, var(--color-success) 30%, transparent)"
              : "color-mix(in srgb, var(--color-accent) 30%, transparent)"
          }`,
          transform: show ? "translateY(0)" : "translateY(-100%)",
          transition: "transform 150ms ease",
        }}
        className="flex items-center justify-center gap-1.5 text-sm text-fg-secondary"
      >
        <Check
          className="h-3.5 w-3.5 flex-shrink-0"
          style={{ color: isSave ? "var(--color-success)" : "var(--color-accent)" }}
        />
        <span>{message}</span>
        <span className="mx-0.5">&middot;</span>
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          view on GitHub &#8599;
        </a>
      </div>
    </div>
  );
}
