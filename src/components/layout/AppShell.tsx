"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { cn } from "@/lib/utils";
import { SaveStatus } from "@/types";

interface AppShellProps {
  children: React.ReactNode;
  // Editor-specific props (optional — only on editor pages)
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

export function AppShell({
  children,
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
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* Sidebar */}
      <div
        className={cn(
          "flex-shrink-0 transition-all duration-200",
          sidebarOpen ? "w-[200px]" : "w-0 overflow-hidden"
        )}
      >
        <Sidebar
          currentRepoOwner={repoOwner}
          currentRepoName={repoName}
          currentFilePath={filePath}
        />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          saveStatus={saveStatus}
          prNumber={prNumber}
          prUrl={prUrl}
          onSave={onSave}
          onProposeChanges={onProposeChanges}
          filePath={filePath}
          repoOwner={repoOwner}
          repoName={repoName}
          effectiveBranch={effectiveBranch}
          draftBranch={draftBranch}
        />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
