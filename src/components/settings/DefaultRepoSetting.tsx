"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { RepoInfo, FolderNode } from "@/types";
import toast from "react-hot-toast";

interface DefaultRepoSettingProps {
  initialDefaultRepo: string | null;
  initialDefaultFolder: string | null;
}

const NONE_VALUE = "__none__";

function findChildren(
  folders: FolderNode[],
  pathSegments: string[]
): FolderNode[] {
  let level = folders;
  for (const segment of pathSegments) {
    const match = level.find((n) => n.name === segment);
    if (!match) return [];
    level = match.children;
  }
  return level;
}

export function DefaultRepoSetting({
  initialDefaultRepo,
  initialDefaultFolder,
}: DefaultRepoSettingProps) {
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState(initialDefaultRepo ?? "");
  const [folderPath, setFolderPath] = useState<string[]>(
    initialDefaultFolder ? initialDefaultFolder.split("/").filter(Boolean) : []
  );
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);

  useEffect(() => {
    fetch("/api/github/repos")
      .then((r) => r.json())
      .then((data) => {
        if (data.repos) setRepos(data.repos);
      })
      .catch(() => toast.error("Failed to load repositories."))
      .finally(() => setReposLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedRepo) {
      setFolders([]);
      return;
    }
    let cancelled = false;
    setFoldersLoading(true);
    fetch(`/api/github/${selectedRepo}/tree`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setFolders(data.folders ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load folders.");
      })
      .finally(() => {
        if (!cancelled) setFoldersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRepo]);

  // Compute children at each depth using folder *names* (not full paths),
  // since FolderNode children are siblings whose `name` is the next segment.
  const dropdownRows = useMemo(() => {
    const rows: { options: FolderNode[]; selected: string | null }[] = [];
    for (let depth = 0; depth <= folderPath.length; depth++) {
      const ancestorSegments = folderPath.slice(0, depth);
      const options = findChildren(folders, ancestorSegments);
      if (options.length === 0 && depth === folderPath.length) break;
      rows.push({
        options,
        selected: depth < folderPath.length ? folderPath[depth] : null,
      });
    }
    return rows;
  }, [folders, folderPath]);

  function handleRepoChange(value: string) {
    setSelectedRepo(value);
    setFolderPath([]);
  }

  function handleFolderSelect(depth: number, value: string) {
    if (value === NONE_VALUE) {
      setFolderPath(folderPath.slice(0, depth));
    } else {
      const next = [...folderPath.slice(0, depth), value];
      setFolderPath(next);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultRepo: selectedRepo || null,
          defaultFolder: selectedRepo && folderPath.length > 0
            ? folderPath.join("/")
            : null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Default saved.");
    } catch {
      toast.error("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const selectClass =
    "flex-1 max-w-xs px-3 py-1.5 text-[13px] text-fg bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors";

  return (
    <section className="bg-surface border border-border rounded-lg p-6 mb-4">
      <h2 className="text-[14px] font-semibold text-fg mb-1">
        Default repository &amp; folder
      </h2>
      <p className="text-sm text-fg-tertiary mb-4">
        Automatically load this repo (and folder) when you sign in
      </p>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {reposLoading ? (
            <div className="flex items-center gap-2 text-sm text-fg-tertiary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading repositories...
            </div>
          ) : (
            <select
              value={selectedRepo}
              onChange={(e) => handleRepoChange(e.target.value)}
              className={selectClass}
            >
              <option value="">No default — show all repos</option>
              {repos.map((repo) => (
                <option key={repo.fullName} value={repo.fullName}>
                  {repo.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedRepo && (
          <div className="space-y-2 pl-1 border-l-2 border-border-secondary ml-1">
            <p className="text-xs text-fg-tertiary pl-3">
              {folderPath.length === 0
                ? "Open at repo root"
                : `Open at: ${folderPath.join("/")}`}
            </p>

            {foldersLoading ? (
              <div className="flex items-center gap-2 text-sm text-fg-tertiary pl-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading folders...
              </div>
            ) : (
              <div className="space-y-2 pl-3">
                {dropdownRows.map((row, depth) =>
                  row.options.length === 0 ? null : (
                    <select
                      key={depth}
                      value={row.selected ?? NONE_VALUE}
                      onChange={(e) => handleFolderSelect(depth, e.target.value)}
                      className={selectClass}
                    >
                      <option value={NONE_VALUE}>
                        {depth === 0
                          ? "— Choose a folder (optional)"
                          : "— Stop here"}
                      </option>
                      {row.options.map((node) => (
                        <option key={node.path} value={node.name}>
                          {node.name}
                        </option>
                      ))}
                    </select>
                  )
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || reposLoading}
            className="px-4 py-1.5 bg-fg text-fg-inverted rounded-md text-[13px] font-medium hover:bg-fg/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </section>
  );
}
