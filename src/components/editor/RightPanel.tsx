"use client";

import { Settings, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { FrontmatterPanelContent } from "./FrontmatterPanel";
import { CommentThread } from "./CommentThread";
import type { FrontmatterData, SchemaField, CommentWithAuthor } from "@/types";

export type RightPanelView = "none" | "settings" | "comments";

interface RightPanelProps {
  activePanel: RightPanelView;
  onToggle: (panel: "settings" | "comments") => void;
  unresolvedCommentCount: number;
  // Settings
  hasFrontmatter: boolean;
  frontmatterData: FrontmatterData;
  onFrontmatterChange: (data: FrontmatterData) => void;
  schema: SchemaField[] | null;
  collectionLabel: string | null;
  frontmatterLoading: boolean;
  picklists: Record<string, string[]>;
  // Comments
  comments: CommentWithAuthor[];
  onResolveComment: (commentId: string) => Promise<void>;
  onReplyComment: (commentId: string, body: string) => Promise<boolean>;
  onRefreshComments: () => void;
  highlightedCommentId: string | null;
  newlyAddedCommentId: string | null;
}

export function RightPanel({
  activePanel,
  onToggle,
  unresolvedCommentCount,
  hasFrontmatter,
  frontmatterData,
  onFrontmatterChange,
  schema,
  collectionLabel,
  frontmatterLoading,
  picklists,
  comments,
  onResolveComment,
  onReplyComment,
  onRefreshComments,
  highlightedCommentId,
  newlyAddedCommentId,
}: RightPanelProps) {
  const isOpen = activePanel !== "none";

  return (
    <div className="flex flex-shrink-0 h-full">
      {/* Expandable panel area */}
      <div
        className="overflow-hidden transition-[width]"
        style={{
          width: isOpen ? 280 : 0,
          transitionDuration: "150ms",
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div
          className="w-[280px] h-full border-l border-border flex flex-col bg-surface transition-transform"
          style={{
            transform: isOpen ? "translateX(0)" : "translateX(100%)",
            transitionDuration: "150ms",
            transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {activePanel === "settings" && (
            <>
              <PanelHeader label={collectionLabel ?? "Document settings"} />
              <FrontmatterPanelContent
                data={frontmatterData}
                onChange={onFrontmatterChange}
                schema={schema}
                collectionLabel={collectionLabel}
                loading={frontmatterLoading}
                picklists={picklists}
              />
            </>
          )}
          {activePanel === "comments" && (
            <>
              <PanelHeader label="Comments" />
              <CommentThread
                comments={comments}
                onResolve={onResolveComment}
                onReply={onReplyComment}
                onRefresh={onRefreshComments}
                highlightedCommentId={highlightedCommentId}
                newlyAddedCommentId={newlyAddedCommentId}
              />
            </>
          )}
        </div>
      </div>

      {/* Icon bar — always visible */}
      <div className="w-10 border-l border-border-secondary flex flex-col items-center pt-3 gap-1 flex-shrink-0 bg-surface">
        <IconButton
          icon={Settings}
          tooltip="Document settings"
          active={activePanel === "settings"}
          disabled={!hasFrontmatter}
          onClick={() => hasFrontmatter && onToggle("settings")}
        />
        <IconButton
          icon={MessageSquare}
          tooltip="Comments"
          active={activePanel === "comments"}
          badgeCount={unresolvedCommentCount}
          onClick={() => onToggle("comments")}
        />
      </div>
    </div>
  );
}

function PanelHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center px-4 py-3 border-b border-border flex-shrink-0">
      <span className="text-xs font-semibold text-fg-secondary uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}

function IconButton({
  icon: Icon,
  tooltip,
  active,
  disabled,
  badgeCount,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
  active: boolean;
  disabled?: boolean;
  badgeCount?: number;
  onClick: () => void;
}) {
  const badgeLabel = badgeCount && badgeCount > 0
    ? badgeCount >= 100 ? "99+" : String(badgeCount)
    : null;

  return (
    <button
      onClick={disabled ? undefined : onClick}
      className={cn(
        "relative w-10 h-10 flex items-center justify-center rounded-sm transition-colors",
        disabled && "opacity-40 cursor-default",
        !disabled && !active && "text-fg-tertiary hover:text-fg hover:bg-surface-tertiary cursor-pointer",
        !disabled && active && "text-accent cursor-pointer"
      )}
      title={tooltip}
      aria-label={tooltip}
    >
      <Icon className="h-4 w-4" />
      {badgeLabel && (
        <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 flex items-center justify-center rounded-full bg-accent text-white text-xs font-semibold leading-none">
          {badgeLabel}
        </span>
      )}
    </button>
  );
}
