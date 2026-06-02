"use client";

import { useState, useEffect, useMemo } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import toast from "react-hot-toast";

interface NewFileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner: string;
  repo: string;
  folderPath: string;
  requirePR?: boolean;
  onFileCreated: (filePath: string) => void;
}

function generateSlug(title: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${today}-${slug}`;
}

export function NewFileModal({
  open,
  onOpenChange,
  owner,
  repo,
  folderPath,
  requirePR,
  onFileCreated,
}: NewFileModalProps) {
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setTitle("");
      setCreating(false);
      setError(null);
    }
  }, [open]);

  const slug = useMemo(() => generateSlug(title), [title]);
  const filename = `${slug}.md`;
  const canCreate = title.trim().length > 0;

  const displayPath = folderPath.startsWith("/")
    ? folderPath
    : `/${folderPath}`;

  async function handleCreate() {
    if (!canCreate || creating) return;

    setCreating(true);
    setError(null);

    const filePath = folderPath ? `${folderPath}/${filename}` : filename;

    try {
      const res = await fetch(`/api/github/${owner}/${repo}/new-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: filePath,
          title: title.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setError(
            "A file with this name already exists in this folder. Try a different title."
          );
        } else {
          setError(data.actionable ?? "Something went wrong. Please try again.");
        }
        setCreating(false);
        return;
      }

      onOpenChange(false);

      const branchForLink = data.branch || "main";
      const githubUrl = `https://github.com/${owner}/${repo}/blob/${branchForLink}/${filePath}`;
      toast.success(
        <span>
          {data.branch ? "Added to your draft branch" : "File created"} ·{" "}
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            view on GitHub ↗
          </a>
        </span>
      );

      onFileCreated(filePath);
    } catch {
      setError("Something went wrong. Please try again.");
      setCreating(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && canCreate && !creating) {
      e.preventDefault();
      handleCreate();
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!creating) onOpenChange(v);
      }}
      title="New file"
      description={
        requirePR
          ? `Adds a markdown file to ${displayPath} on your draft branch`
          : `A markdown file will be created in ${displayPath}`
      }
      className="max-w-[480px]"
    >
      <div className="space-y-4">
        {requirePR && (
          <p className="text-[12px] text-fg-tertiary leading-relaxed">
            This file will be committed to your personal draft branch — not
            the main branch. When you&apos;re done, click <strong>Propose
            changes</strong> to open a pull request with all pending changes.
          </p>
        )}
        <div>
          <label className="block text-sm font-medium text-fg mb-1.5">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Getting Started with Arcflow"
            disabled={creating}
            autoFocus
            className="w-full px-3 py-2 border border-border rounded-md text-[13px] bg-surface text-fg placeholder:text-fg-tertiary focus:outline-none focus:ring-2 focus:ring-fg/10 focus:border-fg-tertiary disabled:opacity-50"
          />
          {title.trim() && (
            <p className="mt-1.5 text-xs text-fg-tertiary font-mono">
              File will be saved as: {filename}
            </p>
          )}
        </div>

        {error && (
          <p className="text-[13px] text-red-500">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button
            variant="secondary"
            size="md"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleCreate}
            disabled={!canCreate}
            loading={creating}
          >
            {creating ? "Creating..." : "Create file"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
