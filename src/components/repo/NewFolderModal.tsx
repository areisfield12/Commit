"use client";

import { useState, useEffect, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import toast from "react-hot-toast";

interface NewFolderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner: string;
  repo: string;
  parentPath: string;
  existingChildFolderNames: string[];
  onCreated: (folderPath: string, filePath: string) => void;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

function generateFileSlug(title: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${today}-${slugify(title)}`;
}

export function NewFolderModal({
  open,
  onOpenChange,
  owner,
  repo,
  parentPath,
  existingChildFolderNames,
  onCreated,
}: NewFolderModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [folderName, setFolderName] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setFolderName("");
      setPageTitle("");
      setCreating(false);
      setError(null);
    }
  }, [open]);

  const folderSlug = useMemo(() => slugify(folderName), [folderName]);
  const fileSlug = useMemo(() => generateFileSlug(pageTitle), [pageTitle]);
  const fileName = `${fileSlug}.md`;

  const folderDisplayPath = parentPath.startsWith("/") ? parentPath : `/${parentPath}`;

  const existingSet = useMemo(
    () => new Set(existingChildFolderNames.map((n) => n.toLowerCase())),
    [existingChildFolderNames]
  );

  const folderNameError = useMemo(() => {
    if (!folderName.trim()) return null;
    if (!folderSlug) return "Folder name must contain letters or numbers.";
    if (existingSet.has(folderSlug)) return "A folder with this name already exists here.";
    return null;
  }, [folderName, folderSlug, existingSet]);

  const canAdvance = folderName.trim().length > 0 && !folderNameError;
  const canCreate = pageTitle.trim().length > 0;

  async function handleCreate() {
    if (!canCreate || creating) return;
    setCreating(true);
    setError(null);

    const newFolderPath = parentPath ? `${parentPath}/${folderSlug}` : folderSlug;
    const filePath = `${newFolderPath}/${fileName}`;

    try {
      const res = await fetch(`/api/github/${owner}/${repo}/new-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath, title: pageTitle.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setError(
            "A file with this name already exists. Try a different page title."
          );
        } else {
          setError(data.actionable ?? "Something went wrong. Please try again.");
        }
        setCreating(false);
        return;
      }

      onOpenChange(false);

      const githubUrl = `https://github.com/${owner}/${repo}/blob/main/${filePath}`;
      toast.success(
        <span>
          Folder and page created ·{" "}
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

      onCreated(newFolderPath, filePath);
    } catch {
      setError("Something went wrong. Please try again.");
      setCreating(false);
    }
  }

  function handleStep1KeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && canAdvance) {
      e.preventDefault();
      setStep(2);
    }
  }

  function handleStep2KeyDown(e: React.KeyboardEvent) {
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
      title={step === 1 ? "New folder" : "First page in folder"}
      description={
        step === 1
          ? `A folder will be created in ${folderDisplayPath}`
          : `Add the first page to /${parentPath ? `${parentPath}/` : ""}${folderSlug}`
      }
      className="max-w-[480px]"
    >
      {step === 1 ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-fg mb-1.5">
              Folder name
            </label>
            <input
              type="text"
              value={folderName}
              onChange={(e) => {
                setFolderName(e.target.value);
                setError(null);
              }}
              onKeyDown={handleStep1KeyDown}
              placeholder="e.g. Case Studies"
              autoFocus
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] bg-surface text-fg placeholder:text-fg-tertiary focus:outline-none focus:ring-2 focus:ring-fg/10 focus:border-fg-tertiary"
            />
            {folderName.trim() && folderSlug && (
              <p className="mt-1.5 text-xs text-fg-tertiary font-mono">
                Folder will be saved as: {folderSlug}
              </p>
            )}
            {folderNameError && (
              <p className="mt-1.5 text-[13px] text-red-500">{folderNameError}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" size="md" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => setStep(2)}
              disabled={!canAdvance}
            >
              Next
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-fg mb-1.5">
              Page title
            </label>
            <input
              type="text"
              value={pageTitle}
              onChange={(e) => {
                setPageTitle(e.target.value);
                setError(null);
              }}
              onKeyDown={handleStep2KeyDown}
              placeholder="e.g. Welcome to the team"
              disabled={creating}
              autoFocus
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] bg-surface text-fg placeholder:text-fg-tertiary focus:outline-none focus:ring-2 focus:ring-fg/10 focus:border-fg-tertiary disabled:opacity-50"
            />
            {pageTitle.trim() && (
              <p className="mt-1.5 text-xs text-fg-tertiary font-mono">
                File will be saved as: {fileName}
              </p>
            )}
          </div>

          {error && <p className="text-[13px] text-red-500">{error}</p>}

          <div className="flex justify-between gap-3 pt-2">
            <Button
              variant="ghost"
              size="md"
              onClick={() => setStep(1)}
              disabled={creating}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
            <div className="flex gap-3">
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
                {creating ? "Creating..." : "Create folder"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
