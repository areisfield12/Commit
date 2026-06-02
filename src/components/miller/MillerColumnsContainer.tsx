"use client";

import { useRef, useEffect, useMemo } from "react";
import { MillerColumn, MillerItem } from "./MillerColumn";
import { FileListPanel } from "./FileListPanel";
import { Collection, FolderNode } from "@/types";
import { filePathToDisplayName } from "@/lib/utils";

interface MillerColumnsContainerProps {
  folders: FolderNode[];
  collections: Collection[];
  markdownPaths: string[];
  foldersWithMarkdown: Set<string>;
  foldersWithDirectFiles: Set<string>;
  selectedPath: string[];
  activeListFolder: string | null;
  owner: string;
  repo: string;
  onSelectFolder: (folderPath: string, depth: number) => void;
  onSelectFile: (filePath: string) => void;
  onCreatePage?: (folderPath: string) => void;
  onCreateFolder?: (parentPath: string) => void;
}

function findFolderNode(nodes: FolderNode[], path: string): FolderNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    const found = findFolderNode(node.children, path);
    if (found) return found;
  }
  return null;
}

function buildColumnItems(
  folderNodes: FolderNode[],
  collections: Collection[],
  directFiles: string[],
  foldersWithMarkdown: Set<string>,
): MillerItem[] {
  const items: MillerItem[] = [];

  // Collections first
  for (const col of collections) {
    items.push({ type: "collection", path: col.folderPath, label: col.label });
  }

  // Folders (filtered to those containing markdown)
  const collectionPaths = new Set(collections.map((c) => c.folderPath));
  for (const node of folderNodes) {
    if (collectionPaths.has(node.path)) continue;
    if (!foldersWithMarkdown.has(node.path)) continue;
    items.push({ type: "folder", path: node.path, name: node.name });
  }

  // Direct files
  for (const filePath of directFiles) {
    const filename = filePath.split("/").pop() ?? filePath;
    items.push({
      type: "file",
      path: filePath,
      displayName: filePathToDisplayName(filename),
    });
  }

  return items;
}

export function MillerColumnsContainer({
  folders,
  collections,
  markdownPaths,
  foldersWithMarkdown,
  foldersWithDirectFiles,
  selectedPath,
  activeListFolder,
  owner,
  repo,
  onSelectFolder,
  onSelectFile,
  onCreatePage,
  onCreateFolder,
}: MillerColumnsContainerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to rightmost column when navigation changes
  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "end" });
    }
  }, [selectedPath, activeListFolder]);

  // Get root-level markdown files (no folder prefix)
  const rootFiles = useMemo(() => {
    return markdownPaths.filter((p) => !p.includes("/"));
  }, [markdownPaths]);

  // Build column 0 items: collections + top-level folders + root files
  const column0Items = useMemo(
    () => buildColumnItems(folders, collections, rootFiles, foldersWithMarkdown),
    [folders, collections, rootFiles, foldersWithMarkdown]
  );

  // Find the collection matching the active list folder
  const activeCollection = activeListFolder
    ? collections.find((c) => c.folderPath === activeListFolder) ?? null
    : null;

  const handleColumnSelect = (depth: number) => (path: string, itemType: MillerItem["type"]) => {
    if (itemType === "file") {
      onSelectFile(path);
    } else {
      onSelectFolder(path, depth);
    }
  };

  return (
    <div ref={scrollRef} className="flex-1 flex overflow-x-auto overflow-y-hidden">
      {/* Column 0: top-level (no "+" button — repo root creation not exposed) */}
      <MillerColumn
        items={column0Items}
        selectedItem={selectedPath[0] ?? null}
        onSelect={handleColumnSelect(0)}
        label={repo}
      />

      {/* Columns 1..N: each driven by selectedPath[N-1] */}
      {selectedPath.map((folderPath, index) => {
        // Don't render a column for the folder if it's the active list folder
        if (activeListFolder === folderPath) return null;

        const node = findFolderNode(folders, folderPath);
        // For collections that map to this path, we still need children
        const childFolders = node?.children ?? [];

        // Direct markdown files in this folder
        const prefix = folderPath + "/";
        const directFiles = markdownPaths.filter((p) => {
          if (!p.startsWith(prefix)) return false;
          const rest = p.slice(prefix.length);
          return !rest.includes("/");
        });

        const columnItems = buildColumnItems(
          childFolders,
          [], // No collections in sub-columns
          directFiles,
          foldersWithMarkdown,
        );

        if (columnItems.length === 0) return null;

        const columnLabel = node?.name ?? folderPath.split("/").pop() ?? folderPath;

        return (
          <MillerColumn
            key={folderPath}
            items={columnItems}
            selectedItem={selectedPath[index + 1] ?? null}
            onSelect={handleColumnSelect(index + 1)}
            label={columnLabel}
            folderPath={folderPath}
            onCreatePage={onCreatePage}
            onCreateFolder={onCreateFolder}
          />
        );
      })}

      {/* File list panel */}
      {activeListFolder && (
        <FileListPanel
          owner={owner}
          repo={repo}
          folderPath={activeListFolder}
          collection={activeCollection}
          onSelectFile={onSelectFile}
        />
      )}

      {/* Scroll anchor */}
      <div ref={endRef} className="flex-shrink-0 w-px" />
    </div>
  );
}
