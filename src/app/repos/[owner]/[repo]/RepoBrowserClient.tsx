"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, FileText, GitPullRequest, ExternalLink, GitBranch } from "lucide-react";
import { MillerColumnsContainer } from "@/components/miller/MillerColumnsContainer";
import { MillerBreadcrumb } from "@/components/miller/MillerBreadcrumb";
import { NewFileModal } from "@/components/repo/NewFileModal";
import { NewFolderModal } from "@/components/repo/NewFolderModal";
import { ProposeDraftModal } from "@/components/pr/ProposeDraftModal";
import { Collection, FileNode, FolderNode } from "@/types";
import toast from "react-hot-toast";

interface DraftFile {
  path: string;
  status: "added" | "modified" | "removed" | "renamed";
  previousPath?: string;
  additions: number;
  deletions: number;
}

interface DraftCommit {
  sha: string;
  message: string;
}

interface DraftTotals {
  additions: number;
  deletions: number;
  commits: number;
}

interface DraftState {
  branch: string | null;
  baseBranch: string;
  files: DraftFile[];
  commits: DraftCommit[];
  totals: DraftTotals;
}

interface RepoBrowserClientProps {
  owner: string;
  repo: string;
  userId: string;
  initialStarredPaths: string[];
  requirePR: boolean;
}

export function RepoBrowserClient({
  owner,
  repo,
  requirePR,
}: RepoBrowserClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialFolder = searchParams.get("folder");
  const hasAppliedInitialFolder = useRef(false);

  // Data state
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [markdownPaths, setMarkdownPaths] = useState<string[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  // Navigation state
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [activeListFolder, setActiveListFolder] = useState<string | null>(null);

  // Modal state for "+" button in column headers
  const [newPageFolderPath, setNewPageFolderPath] = useState<string | null>(null);
  const [newFolderParentPath, setNewFolderParentPath] = useState<string | null>(null);

  // Draft branch state (only relevant when requirePR is true)
  const [draft, setDraft] = useState<DraftState>({
    branch: null,
    baseBranch: "main",
    files: [],
    commits: [],
    totals: { additions: 0, deletions: 0, commits: 0 },
  });
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const refreshDraft = useCallback(() => {
    return fetch(`/api/github/${owner}/${repo}/draft`)
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data === "object" && "files" in data) {
          setDraft({
            branch: data.branch ?? null,
            baseBranch: data.baseBranch ?? "main",
            files: data.files ?? [],
            commits: data.commits ?? [],
            totals: data.totals ?? { additions: 0, deletions: 0, commits: 0 },
          });
        }
      })
      .catch(() => {/* non-critical */});
  }, [owner, repo]);

  useEffect(() => {
    if (requirePR) refreshDraft();
  }, [requirePR, refreshDraft]);

  const handleDiscardDraft = useCallback(async () => {
    if (!confirm("Discard all pending changes? This cannot be undone.")) return;
    setDiscarding(true);
    try {
      const res = await fetch(`/api/github/${owner}/${repo}/draft`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to discard pending changes.");
        return;
      }
      setDraft({
        branch: null,
        baseBranch: draft.baseBranch,
        files: [],
        commits: [],
        totals: { additions: 0, deletions: 0, commits: 0 },
      });
      toast.success("Pending changes discarded.");
    } finally {
      setDiscarding(false);
    }
  }, [owner, repo, draft.baseBranch]);

  const handlePROpened = useCallback((prNumber: number, prUrl: string) => {
    setDraft({
      branch: null,
      baseBranch: draft.baseBranch,
      files: [],
      commits: [],
      totals: { additions: 0, deletions: 0, commits: 0 },
    });
    setShowProposeModal(false);
    toast.success(
      <span>
        PR #{prNumber} opened ·{" "}
        <a href={prUrl} target="_blank" rel="noopener noreferrer" className="underline">
          view on GitHub
        </a>
      </span>
    );
  }, [draft.baseBranch]);

  const refreshTreeAndFiles = useCallback(() => {
    return Promise.all([
      fetch(`/api/github/${owner}/${repo}/tree`).then((r) => r.json()),
      fetch(`/api/github/${owner}/${repo}/files`).then((r) => r.json()),
    ]).then(([treeData, filesData]) => {
      setFolders(treeData.folders ?? []);
      setMarkdownPaths(
        ((filesData.files ?? []) as FileNode[]).map((f) => f.path)
      );
    });
  }, [owner, repo]);

  // Fetch tree, files, and collections on mount
  useEffect(() => {
    setLoading(true);
    refreshTreeAndFiles()
      .catch(() => toast.error("Failed to load repository."))
      .finally(() => setLoading(false));

    // Fetch collections independently so a failure doesn't block the repo browser
    fetch(`/api/collections?owner=${owner}&repo=${repo}`)
      .then((r) => r.json())
      .then((data) => setCollections(data.collections ?? []))
      .catch(() => {/* collections are non-critical, fail silently */});
  }, [owner, repo, refreshTreeAndFiles]);

  // Folders that contain at least one markdown file at any depth
  const foldersWithMarkdown = useMemo(() => {
    const paths = new Set<string>();
    for (const filePath of markdownPaths) {
      const parts = filePath.split("/");
      for (let i = 1; i < parts.length; i++) {
        paths.add(parts.slice(0, i).join("/"));
      }
    }
    return paths;
  }, [markdownPaths]);

  // Folders that contain markdown files directly (not just in subfolders)
  const foldersWithDirectFiles = useMemo(() => {
    const paths = new Set<string>();
    for (const filePath of markdownPaths) {
      const parts = filePath.split("/");
      if (parts.length > 1) {
        paths.add(parts.slice(0, -1).join("/"));
      }
    }
    return paths;
  }, [markdownPaths]);

  const findFolderNode = useCallback(
    (path: string): FolderNode | null => {
      const search = (nodes: FolderNode[]): FolderNode | null => {
        for (const node of nodes) {
          if (node.path === path) return node;
          const found = search(node.children);
          if (found) return found;
        }
        return null;
      };
      return search(folders);
    },
    [folders]
  );

  const handleSelectFolder = useCallback(
    (folderPath: string, depth: number) => {
      // If clicking the already-selected folder at this depth, collapse
      if (selectedPath[depth] === folderPath) {
        setSelectedPath(selectedPath.slice(0, depth));
        setActiveListFolder(null);
        return;
      }

      // Truncate to this depth and add new selection
      const newPath = [...selectedPath.slice(0, depth), folderPath];

      // Check if this folder has subfolders with markdown content
      const node = findFolderNode(folderPath);
      const hasSubfoldersWithMd =
        node !== null &&
        node.children.some((c) => foldersWithMarkdown.has(c.path));
      const hasDirectFiles = foldersWithDirectFiles.has(folderPath);

      setSelectedPath(newPath);

      // Show file list panel if folder has direct files and no subfolders with markdown
      if (!hasSubfoldersWithMd && hasDirectFiles) {
        setActiveListFolder(folderPath);
      } else {
        setActiveListFolder(null);
      }
    },
    [selectedPath, findFolderNode, foldersWithMarkdown, foldersWithDirectFiles]
  );

  const handleSelectFile = useCallback(
    (filePath: string) => {
      router.push(`/repos/${owner}/${repo}/edit/${filePath}`);
    },
    [owner, repo, router]
  );

  const handleCreatePage = useCallback((folderPath: string) => {
    setNewPageFolderPath(folderPath);
  }, []);

  const handleCreateFolder = useCallback((parentPath: string) => {
    setNewFolderParentPath(parentPath);
  }, []);

  // Child folder names directly under a given parent — used to block sibling collisions
  const childFolderNames = useMemo(() => {
    if (newFolderParentPath === null) return [];
    const node = findFolderNode(newFolderParentPath);
    return (node?.children ?? []).map((c) => c.name);
  }, [newFolderParentPath, findFolderNode]);

  const handleNewPageCreated = useCallback(
    (filePath: string) => {
      setNewPageFolderPath(null);
      if (requirePR) refreshDraft();
      router.push(`/repos/${owner}/${repo}/edit/${filePath}`);
    },
    [owner, repo, router, requirePR, refreshDraft]
  );

  const handleNewFolderCreated = useCallback(
    async (folderPath: string, filePath: string) => {
      setNewFolderParentPath(null);

      // Extend selection to include the new folder so it's visible immediately
      const parts = folderPath.split("/");
      const newSelected: string[] = [];
      for (let i = 1; i <= parts.length; i++) {
        newSelected.push(parts.slice(0, i).join("/"));
      }
      setSelectedPath(newSelected);

      // Refresh in the background; navigate immediately to the new page
      refreshTreeAndFiles().catch(() => {
        toast.error("Created folder, but failed to refresh the repository view.");
      });
      if (requirePR) refreshDraft();
      router.push(`/repos/${owner}/${repo}/edit/${filePath}`);
    },
    [owner, repo, router, refreshTreeAndFiles, requirePR, refreshDraft]
  );

  const handleBreadcrumbNavigate = useCallback(
    (depth: number) => {
      if (depth < 0) {
        // Root click — reset everything
        setSelectedPath([]);
        setActiveListFolder(null);
      } else {
        // Navigate to this depth (keep selectedPath up to and including depth)
        const newPath = selectedPath.slice(0, depth + 1);
        setSelectedPath(newPath);

        // Re-evaluate whether the last folder should show file list
        const lastFolder = newPath[newPath.length - 1];
        if (lastFolder) {
          const node = findFolderNode(lastFolder);
          const hasSubfoldersWithMd =
            node !== null &&
            node.children.some((c) => foldersWithMarkdown.has(c.path));
          const hasDirectFiles = foldersWithDirectFiles.has(lastFolder);

          if (!hasSubfoldersWithMd && hasDirectFiles) {
            setActiveListFolder(lastFolder);
          } else {
            setActiveListFolder(null);
          }
        } else {
          setActiveListFolder(null);
        }
      }
    },
    [selectedPath, findFolderNode, foldersWithMarkdown, foldersWithDirectFiles]
  );

  // Expand Miller columns to deep-linked folder from query param
  useEffect(() => {
    if (loading || !initialFolder || hasAppliedInitialFolder.current) return;
    hasAppliedInitialFolder.current = true;

    const parts = initialFolder.split("/");
    const pathEntries: string[] = [];
    for (let i = 1; i <= parts.length; i++) {
      pathEntries.push(parts.slice(0, i).join("/"));
    }

    const validPath: string[] = [];
    for (const entry of pathEntries) {
      if (findFolderNode(entry)) {
        validPath.push(entry);
      } else {
        break;
      }
    }

    if (validPath.length === 0) return;

    setSelectedPath(validPath);

    const deepestFolder = validPath[validPath.length - 1];
    const node = findFolderNode(deepestFolder);
    const hasSubfoldersWithMd =
      node !== null &&
      node.children.some((c) => foldersWithMarkdown.has(c.path));
    const hasDirectFiles = foldersWithDirectFiles.has(deepestFolder);

    if (!hasSubfoldersWithMd && hasDirectFiles) {
      setActiveListFolder(deepestFolder);
    }
  }, [loading, initialFolder, findFolderNode, foldersWithMarkdown, foldersWithDirectFiles]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-fg-tertiary" />
      </div>
    );
  }

  // Empty state: no markdown files at all
  if (markdownPaths.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-8">
        <div className="w-12 h-12 rounded-xl bg-surface-secondary flex items-center justify-center mb-4">
          <FileText className="h-6 w-6 text-fg-tertiary" />
        </div>
        <h2 className="text-[15px] font-medium text-fg mb-1">
          {owner}/{repo}
        </h2>
        <p className="text-[13px] text-fg-tertiary max-w-[320px]">
          No markdown files found in this repository.
        </p>
      </div>
    );
  }

  const hasDraft = requirePR && draft.branch && draft.files.length > 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {hasDraft && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-accent/10 border-b border-accent-border text-[13px]">
          <div className="flex items-center gap-2 min-w-0">
            <GitPullRequest className="h-4 w-4 text-accent flex-shrink-0" />
            <span className="text-fg">
              <span className="font-medium">
                {draft.files.length} pending change{draft.files.length === 1 ? "" : "s"}
              </span>{" "}
              <span className="text-fg-tertiary">
                on your draft branch — not yet merged into{" "}
                <code className="font-mono text-[11px] bg-surface border border-border px-1 py-px rounded">
                  {draft.baseBranch}
                </code>
              </span>
            </span>
            {draft.branch && (
              <a
                href={`https://github.com/${owner}/${repo}/tree/${draft.branch}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-fg-tertiary hover:text-fg ml-1 font-mono text-[11px] max-w-[240px] truncate"
                title={`Draft branch: ${draft.branch}`}
              >
                <GitBranch className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{draft.branch}</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleDiscardDraft}
              disabled={discarding}
              className="px-2.5 py-1 text-[12px] text-fg-tertiary hover:text-fg disabled:opacity-50"
              title="Delete the draft branch and all pending changes"
            >
              Discard
            </button>
            <button
              onClick={() => setShowProposeModal(true)}
              className="px-3 py-1 text-[12px] font-medium bg-fg text-fg-inverted rounded-md hover:bg-fg/90"
            >
              Propose changes
            </button>
          </div>
        </div>
      )}
      <MillerBreadcrumb
        owner={owner}
        repo={repo}
        selectedPath={selectedPath}
        onNavigate={handleBreadcrumbNavigate}
      />
      <MillerColumnsContainer
        folders={folders}
        collections={collections}
        markdownPaths={markdownPaths}
        foldersWithMarkdown={foldersWithMarkdown}
        foldersWithDirectFiles={foldersWithDirectFiles}
        selectedPath={selectedPath}
        activeListFolder={activeListFolder}
        owner={owner}
        repo={repo}
        onSelectFolder={handleSelectFolder}
        onSelectFile={handleSelectFile}
        onCreatePage={handleCreatePage}
        onCreateFolder={handleCreateFolder}
      />

      {newPageFolderPath !== null && (
        <NewFileModal
          open
          onOpenChange={(v) => {
            if (!v) setNewPageFolderPath(null);
          }}
          owner={owner}
          repo={repo}
          folderPath={newPageFolderPath}
          requirePR={requirePR}
          onFileCreated={handleNewPageCreated}
        />
      )}

      {newFolderParentPath !== null && (
        <NewFolderModal
          open
          onOpenChange={(v) => {
            if (!v) setNewFolderParentPath(null);
          }}
          owner={owner}
          repo={repo}
          parentPath={newFolderParentPath}
          existingChildFolderNames={childFolderNames}
          requirePR={requirePR}
          onCreated={handleNewFolderCreated}
        />
      )}

      {showProposeModal && (
        <ProposeDraftModal
          open
          onClose={() => setShowProposeModal(false)}
          owner={owner}
          repo={repo}
          baseBranch={draft.baseBranch}
          draftBranch={draft.branch}
          files={draft.files}
          commits={draft.commits}
          totals={draft.totals}
          onSuccess={handlePROpened}
        />
      )}
    </div>
  );
}
