"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, FileText } from "lucide-react";
import { MillerColumnsContainer } from "@/components/miller/MillerColumnsContainer";
import { MillerBreadcrumb } from "@/components/miller/MillerBreadcrumb";
import { NewFileModal } from "@/components/repo/NewFileModal";
import { NewFolderModal } from "@/components/repo/NewFolderModal";
import { Collection, FileNode, FolderNode } from "@/types";
import toast from "react-hot-toast";

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
      router.push(`/repos/${owner}/${repo}/edit/${filePath}`);
    },
    [owner, repo, router]
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
      router.push(`/repos/${owner}/${repo}/edit/${filePath}`);
    },
    [owner, repo, router, refreshTreeAndFiles]
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

  return (
    <div className="h-full flex flex-col overflow-hidden">
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
          onCreated={handleNewFolderCreated}
        />
      )}
    </div>
  );
}
