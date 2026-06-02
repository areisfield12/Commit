"use client";

import { useState, useEffect } from "react";
import { UserPlus, RefreshCw } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import toast from "react-hot-toast";

interface Collaborator {
  login: string;
  avatarUrl: string;
}

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

interface ProposeDraftModalProps {
  open: boolean;
  onClose: () => void;
  owner: string;
  repo: string;
  baseBranch: string;
  draftBranch?: string | null;
  files: DraftFile[];
  commits: DraftCommit[];
  totals: DraftTotals;
  onSuccess: (prNumber: number, prUrl: string) => void;
}

const STATUS_EMOJI: Record<DraftFile["status"], string> = {
  added: "➕",
  modified: "✏️",
  removed: "🗑️",
  renamed: "🔀",
};

const STATUS_VERB: Record<DraftFile["status"], string> = {
  added: "Add",
  modified: "Update",
  removed: "Remove",
  renamed: "Rename",
};

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

function buildPRTitle(files: DraftFile[]): string {
  if (files.length === 0) return "Update content";

  if (files.length === 1) {
    const f = files[0];
    if (f.status === "renamed" && f.previousPath) {
      return `Rename ${basename(f.previousPath)} → ${basename(f.path)}`;
    }
    return `${STATUS_VERB[f.status]} ${basename(f.path)}`;
  }

  // Count by status
  const counts: Record<DraftFile["status"], number> = {
    added: 0,
    modified: 0,
    removed: 0,
    renamed: 0,
  };
  for (const f of files) counts[f.status]++;

  const distinctStatuses = (Object.keys(counts) as DraftFile["status"][]).filter(
    (s) => counts[s] > 0
  );

  // Mixed statuses — describe by action counts
  if (distinctStatuses.length > 1) {
    const parts: string[] = [];
    if (counts.added > 0) parts.push(`add ${counts.added}`);
    if (counts.modified > 0) parts.push(`update ${counts.modified}`);
    if (counts.removed > 0) parts.push(`remove ${counts.removed}`);
    if (counts.renamed > 0) parts.push(`rename ${counts.renamed}`);
    // Capitalize the first verb
    const joined = parts.join(", ");
    return joined.charAt(0).toUpperCase() + joined.slice(1) + " files";
  }

  // All same status — describe by folder breadth
  const verb = STATUS_VERB[distinctStatuses[0]];
  const folders = new Set(files.map((f) => dirname(f.path) || "/"));
  if (folders.size === 1) {
    const folder = Array.from(folders)[0];
    const folderName = folder === "/" ? "root" : basename(folder);
    return `${verb} ${files.length} files in ${folderName}`;
  }
  return `${verb} ${files.length} files across ${folders.size} folders`;
}

function buildPRBody(
  files: DraftFile[],
  commits: DraftCommit[],
  totals: DraftTotals,
  draftBranch?: string | null
): string {
  if (files.length === 0) return "";

  // Group files by folder
  const byFolder = new Map<string, DraftFile[]>();
  for (const f of files) {
    const folder = dirname(f.path) || "/";
    const list = byFolder.get(folder) ?? [];
    list.push(f);
    byFolder.set(folder, list);
  }

  // Sort folders alphabetically; sort files within a folder by status then name
  const statusOrder: Record<DraftFile["status"], number> = {
    added: 0,
    modified: 1,
    renamed: 2,
    removed: 3,
  };
  const sortedFolders = Array.from(byFolder.keys()).sort();

  const sections: string[] = [];
  sections.push("## Changes");
  sections.push("");

  for (const folder of sortedFolders) {
    const folderFiles = byFolder.get(folder)!.slice().sort((a, b) => {
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return a.path.localeCompare(b.path);
    });
    const folderLabel = folder === "/" ? "_(root)_" : `\`${folder}/\``;
    sections.push(`### ${folderLabel}`);
    for (const f of folderFiles) {
      const emoji = STATUS_EMOJI[f.status];
      const name = basename(f.path);
      const stats = `+${f.additions} / −${f.deletions}`;
      if (f.status === "renamed" && f.previousPath) {
        sections.push(
          `- ${emoji} \`${basename(f.previousPath)}\` → \`${name}\` · ${stats}`
        );
      } else {
        sections.push(`- ${emoji} \`${name}\` · ${stats}`);
      }
    }
    sections.push("");
  }

  // Summary section
  sections.push("## Summary");
  sections.push("");
  const folderCount = byFolder.size;
  const fileCountText = `**${files.length} file${files.length === 1 ? "" : "s"}**`;
  const folderCountText = `**${folderCount} folder${folderCount === 1 ? "" : "s"}**`;
  sections.push(
    folderCount === 1
      ? `- ${fileCountText} changed in ${folderCountText}`
      : `- ${fileCountText} changed across ${folderCountText}`
  );
  sections.push(`- **+${totals.additions}** / **−${totals.deletions}** lines`);
  if (totals.commits > 0) {
    const commitWord = totals.commits === 1 ? "commit" : "commits";
    if (draftBranch) {
      sections.push(`- **${totals.commits}** ${commitWord} on \`${draftBranch}\``);
    } else {
      sections.push(`- **${totals.commits}** ${commitWord}`);
    }
  }

  // Commit history
  if (commits.length > 0) {
    sections.push("");
    sections.push("<details>");
    sections.push("<summary>Commit history</summary>");
    sections.push("");
    for (const c of commits) {
      sections.push(`- \`${c.sha}\` ${c.message}`);
    }
    sections.push("");
    sections.push("</details>");
  }

  return sections.join("\n");
}

export function ProposeDraftModal({
  open,
  onClose,
  owner,
  repo,
  baseBranch,
  draftBranch,
  files,
  commits,
  totals,
  onSuccess,
}: ProposeDraftModalProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reviewers, setReviewers] = useState<string[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(buildPRTitle(files));
    setBody(buildPRBody(files, commits, totals, draftBranch));
    setReviewers([]);
    fetch(`/api/github/${owner}/${repo}/collaborators`)
      .then((r) => r.json())
      .then((data) => setCollaborators(data.collaborators ?? []))
      .catch(() => {});
  }, [open, owner, repo, files, commits, totals, draftBranch]);

  const handleRegenerate = () => {
    const generated = buildPRBody(files, commits, totals, draftBranch);
    setBody((current) => {
      const trimmed = current.trim();
      if (!trimmed) return generated;
      return `${current.replace(/\s+$/, "")}\n\n${generated}`;
    });
    setTitle((current) => current.trim() || buildPRTitle(files));
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/github/${owner}/${repo}/pr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "draft",
          baseBranch,
          title: title.trim(),
          body,
          reviewers,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.actionable ?? "Failed to create pull request");
        return;
      }
      onSuccess(data.number, data.url);
      onClose();
    } catch {
      toast.error("Failed to create pull request. Check your connection.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleReviewer = (login: string) => {
    setReviewers((prev) =>
      prev.includes(login) ? prev.filter((r) => r !== login) : [...prev, login]
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={onClose}
      title="Propose changes"
      description={`Open a pull request with all your pending changes into ${baseBranch}`}
      className="max-w-2xl"
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-fg-secondary block mb-1">
            Pull request title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-md text-[13px] bg-surface focus:outline-none focus:ring-2 focus:ring-fg/10 focus:border-fg-tertiary"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-fg-secondary">
              Description
            </label>
            <button
              type="button"
              onClick={handleRegenerate}
              className="inline-flex items-center gap-1 text-[11px] text-fg-tertiary hover:text-fg"
              title="Append a fresh summary of pending changes below your current text"
            >
              <RefreshCw className="h-3 w-3" />
              Regenerate
            </button>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe what changed and why..."
            rows={10}
            className="w-full px-3 py-2 border border-border rounded-md text-[13px] resize-y bg-surface focus:outline-none focus:ring-2 focus:ring-fg/10 focus:border-fg-tertiary font-mono"
          />
        </div>

        <div>
          <div className="text-sm font-medium text-fg-secondary mb-1.5">
            Pending changes ({files.length})
          </div>
          <div className="max-h-32 overflow-y-auto border border-border rounded-md bg-surface-secondary">
            {files.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-fg-tertiary">No changes detected.</div>
            ) : (
              <ul className="text-[12px] font-mono">
                {files.map((f) => (
                  <li key={f.path} className="px-3 py-1 border-b border-border-secondary last:border-b-0 flex items-center gap-2">
                    <span
                      className={
                        f.status === "added"
                          ? "text-green-600"
                          : f.status === "removed"
                          ? "text-red-600"
                          : "text-fg-tertiary"
                      }
                    >
                      {f.status === "added" ? "+" : f.status === "removed" ? "−" : "~"}
                    </span>
                    <span className="text-fg-secondary truncate flex-1">{f.path}</span>
                    <span className="text-fg-tertiary tabular-nums flex-shrink-0">
                      +{f.additions} / −{f.deletions}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 bg-surface-secondary border border-border rounded-lg text-sm text-fg-secondary flex-wrap">
          <span>From your draft branch</span>
          {draftBranch && (
            <code className="font-mono text-xs bg-surface border border-border px-1.5 py-0.5 rounded truncate max-w-[260px]">
              {draftBranch}
            </code>
          )}
          <span className="text-fg-tertiary">→</span>
          <span>into</span>
          <code className="font-mono text-xs bg-surface border border-border px-1.5 py-0.5 rounded">
            {baseBranch}
          </code>
        </div>

        {collaborators.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-sm font-medium text-fg-secondary mb-2">
              <UserPlus className="h-4 w-4" />
              Request reviewers (optional)
            </div>
            <div className="flex flex-wrap gap-2">
              {collaborators.slice(0, 10).map((c) => (
                <button
                  key={c.login}
                  onClick={() => toggleReviewer(c.login)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium border transition-colors ${
                    reviewers.includes(c.login)
                      ? "bg-surface-tertiary border-border text-fg"
                      : "bg-surface border-border text-fg-tertiary hover:border-fg-tertiary"
                  }`}
                >
                  @{c.login}
                  {reviewers.includes(c.login) && " ✓"}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-border-secondary">
          <Button
            onClick={handleSubmit}
            loading={submitting}
            disabled={!title.trim() || files.length === 0}
          >
            Open pull request
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
