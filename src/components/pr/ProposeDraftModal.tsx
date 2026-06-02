"use client";

import { useState, useEffect } from "react";
import { UserPlus } from "lucide-react";
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
}

interface ProposeDraftModalProps {
  open: boolean;
  onClose: () => void;
  owner: string;
  repo: string;
  baseBranch: string;
  draftBranch?: string | null;
  files: DraftFile[];
  onSuccess: (prNumber: number, prUrl: string) => void;
}

function defaultTitle(files: DraftFile[]): string {
  if (files.length === 0) return "Update content";
  if (files.length === 1) {
    const name = files[0].path.split("/").pop() ?? files[0].path;
    return `${files[0].status === "added" ? "Add" : "Update"} ${name}`;
  }
  return `Update ${files.length} files`;
}

export function ProposeDraftModal({
  open,
  onClose,
  owner,
  repo,
  baseBranch,
  draftBranch,
  files,
  onSuccess,
}: ProposeDraftModalProps) {
  const [title, setTitle] = useState(defaultTitle(files));
  const [body, setBody] = useState("");
  const [reviewers, setReviewers] = useState<string[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle(files));
    fetch(`/api/github/${owner}/${repo}/collaborators`)
      .then((r) => r.json())
      .then((data) => setCollaborators(data.collaborators ?? []))
      .catch(() => {});
  }, [open, owner, repo, files]);

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
          <label className="text-sm font-medium text-fg-secondary block mb-1">
            Description
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe what changed and why..."
            rows={5}
            className="w-full px-3 py-2 border border-border rounded-md text-[13px] resize-none bg-surface focus:outline-none focus:ring-2 focus:ring-fg/10 focus:border-fg-tertiary"
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
                    <span className="text-fg-secondary truncate">{f.path}</span>
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
