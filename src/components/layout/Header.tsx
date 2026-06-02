"use client";

import { Fragment } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, ChevronDown, LogOut, Settings, ExternalLink, GitBranch } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { SaveIndicator } from "./SaveIndicator";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { SaveStatus } from "@/types";
import { cn } from "@/lib/utils";

interface HeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  saveStatus?: SaveStatus;
  prNumber?: number;
  prUrl?: string;
  onSave?: () => void;
  onProposeChanges?: () => void;
  filePath?: string;
  repoOwner?: string;
  repoName?: string;
  effectiveBranch?: string;
  draftBranch?: string | null;
}

export function Header({
  sidebarOpen,
  onToggleSidebar,
  saveStatus,
  prNumber,
  prUrl,
  onSave,
  onProposeChanges,
  filePath,
  repoOwner,
  repoName,
  effectiveBranch,
  draftBranch,
}: HeaderProps) {
  const { data: session } = useSession();
  const router = useRouter();

  const isEditorPage = !!(filePath && repoOwner && repoName);
  const breadcrumbSegments = filePath ? filePath.split("/") : [];

  function handleBreadcrumbClick(folderPath: string) {
    if (saveStatus === "unsaved") {
      const confirmed = confirm("You have unsaved changes. Leave without saving?");
      if (!confirmed) return;
    }
    router.push(`/repos/${repoOwner}/${repoName}?folder=${encodeURIComponent(folderPath)}`);
  }

  return (
    <header className="flex items-center justify-between px-4 py-2.5 bg-surface border-b border-border-secondary h-14 flex-shrink-0">
      {/* Left: sidebar toggle + breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-1 rounded-sm text-fg-tertiary hover:bg-bg-muted hover:text-text-primary cursor-pointer transition-colors"
          aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          {sidebarOpen
            ? <PanelLeftClose className="h-5 w-5" />
            : <PanelLeftOpen className="h-5 w-5" />
          }
        </button>

        {isEditorPage && breadcrumbSegments.length > 0 && (
          <nav className="flex items-center text-[13px] font-mono truncate max-w-md">
            {breadcrumbSegments.map((segment, i) => {
              const isLast = i === breadcrumbSegments.length - 1;

              if (isLast) {
                const displayName = segment.replace(/\.(md|mdx)$/, "");
                return (
                  <Fragment key={i}>
                    {i > 0 && <span className="text-fg-tertiary mx-1">{"\u203A"}</span>}
                    <span className="text-fg-secondary">{displayName}</span>
                  </Fragment>
                );
              }

              const folderPath = breadcrumbSegments.slice(0, i + 1).join("/");
              return (
                <Fragment key={i}>
                  {i > 0 && <span className="text-fg-tertiary mx-1">{"\u203A"}</span>}
                  <button
                    onClick={() => handleBreadcrumbClick(folderPath)}
                    className="text-fg-tertiary hover:text-text-primary hover:underline cursor-pointer transition-colors"
                  >
                    {segment}
                  </button>
                </Fragment>
              );
            })}
          </nav>
        )}
        {isEditorPage && (
          <a
            href={`https://github.com/${repoOwner}/${repoName}/blob/${effectiveBranch ?? "main"}/${filePath}`}
            target="_blank"
            rel="noopener noreferrer"
            title="View file on GitHub"
            className="ml-2 text-fg-tertiary hover:text-fg-secondary transition-colors duration-100 flex-shrink-0"
          >
            <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
          </a>
        )}
        {isEditorPage && draftBranch && (
          <a
            href={`https://github.com/${repoOwner}/${repoName}/tree/${draftBranch}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`Draft branch: ${draftBranch}`}
            className="ml-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-accent-border bg-accent/10 text-[11px] text-accent hover:bg-accent/15 transition-colors max-w-[280px]"
          >
            <GitBranch className="h-3 w-3 flex-shrink-0" />
            <span className="font-medium flex-shrink-0">Draft</span>
            <span className="font-mono text-fg-tertiary truncate" aria-hidden="true">
              {draftBranch}
            </span>
          </a>
        )}
      </div>

      {/* Center: Save indicator */}
      {saveStatus && (
        <SaveIndicator
          status={saveStatus}
          prNumber={prNumber}
          prUrl={prUrl}
          onSave={onSave}
          onProposeChanges={onProposeChanges}
        />
      )}

      {/* Right: Theme toggle + User menu */}
      <div className="flex items-center gap-1">
        <ThemeToggle />

        {session?.user && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-bg-muted transition-colors">
                {session.user.image ? (
                  <Image
                    src={session.user.image}
                    alt={session.user.name ?? "User"}
                    width={28}
                    height={28}
                    className="rounded-full"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-fg flex items-center justify-center text-fg-inverted text-xs font-bold">
                    {session.user.name?.[0] ?? "U"}
                  </div>
                )}
                <span className="text-sm text-fg-secondary max-w-24 truncate">
                  {session.user.githubLogin ?? session.user.name}
                </span>
                <ChevronDown className="h-4 w-4 text-fg-tertiary" />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="z-50 min-w-48 bg-surface rounded-lg shadow-lg border border-border py-1 text-[13px]"
                align="end"
                sideOffset={4}
              >
                {session.user.email && (
                  <>
                    <DropdownMenu.Label className="px-3 py-2 text-xs text-fg-tertiary">
                      {session.user.email}
                    </DropdownMenu.Label>
                    <DropdownMenu.Separator className="h-px bg-border-secondary my-1" />
                  </>
                )}
                <DropdownMenu.Item asChild>
                  <Link
                    href="/settings"
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-fg-secondary hover:bg-bg-muted cursor-pointer outline-none"
                    )}
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex items-center gap-2 px-3 py-2 text-red-500 hover:bg-bg-muted cursor-pointer outline-none"
                  onSelect={() => signOut({ callbackUrl: "/" })}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>
    </header>
  );
}
