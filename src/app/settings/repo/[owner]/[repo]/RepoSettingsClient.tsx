"use client";

import { useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface RepoSettings {
  defaultBranch: string;
  requirePR: boolean;
  protectedBranches: string[];
  imageStorageFolder: string;
  imageUrlPrefix: string;
  organizeByFolder: boolean;
  frontmatterPicklists: Record<string, string[]>;
}

interface RepoSettingsClientProps {
  owner: string;
  repo: string;
  initialSettings: RepoSettings;
}

export function RepoSettingsClient({
  owner,
  repo,
  initialSettings,
}: RepoSettingsClientProps) {
  const [settings, setSettings] = useState<RepoSettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const handleSave = async () => {
    // Validate imageUrlPrefix starts with "/"
    if (!settings.imageUrlPrefix.startsWith("/")) {
      toast.error("Image URL prefix must start with /");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/settings/repo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, ...settings }),
      });
      if (res.ok) {
        toast.success("Repository settings saved");
      } else {
        const data = await res.json();
        toast.error(data.actionable ?? "Failed to save settings");
      }
    } catch {
      toast.error("Failed to save settings. Check your connection.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-fg tracking-[-0.01em]">Repository Settings</h1>
          <p className="text-[13px] text-fg-tertiary mt-1">
            {owner}/{repo}
          </p>
        </div>

        <div className="bg-surface border border-border rounded-lg p-6 space-y-6">
          <div>
            <label className="text-sm font-medium text-fg-secondary block mb-1">
              Default branch
            </label>
            <input
              type="text"
              value={settings.defaultBranch}
              onChange={(e) =>
                setSettings((s) => ({ ...s, defaultBranch: e.target.value }))
              }
              className="w-full max-w-xs px-3 py-2 border border-border rounded-md text-[13px] bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-fg/10 focus:border-fg/20"
            />
            <p className="text-xs text-fg-tertiary mt-1">
              Changes are saved directly to this branch by default
            </p>
          </div>

          {/* Require PR — toggle */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-fg-secondary">
                Pull request workflow
              </p>
              <p className="text-xs text-fg-tertiary mt-0.5">
                When enabled, every change (new folders, new files, edits, image
                uploads) is collected on a personal draft branch. Click
                &ldquo;Propose changes&rdquo; to open a single pull request when
                you&apos;re ready.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
              <button
                role="switch"
                aria-checked={settings.requirePR}
                onClick={() =>
                  setSettings((s) => ({ ...s, requirePR: !s.requirePR }))
                }
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full cursor-pointer transition-colors",
                  settings.requirePR ? "bg-accent" : "bg-border"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                    settings.requirePR ? "translate-x-[18px]" : "translate-x-[3px]"
                  )}
                />
              </button>
              <span
                className={cn(
                  "text-xs w-12",
                  settings.requirePR ? "text-success" : "text-fg-tertiary"
                )}
              >
                {settings.requirePR ? "Enabled" : ""}
              </span>
            </div>
          </div>

          {/* Images section */}
          <div className="pt-4 border-t border-border-secondary">
            <h2 className="text-sm font-semibold text-fg mb-4">Images</h2>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-fg-secondary block mb-1">
                  Image storage folder
                </label>
                <input
                  type="text"
                  value={settings.imageStorageFolder}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, imageStorageFolder: e.target.value.replace(/^\/+/, "") }))
                  }
                  placeholder="public/images"
                  className="w-full px-3 py-2 border border-border rounded-md text-[13px] bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-fg/10 focus:border-fg/20"
                />
                <p className="text-xs text-fg-tertiary mt-1">
                  Where uploaded images are saved in your repository
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-fg-secondary block mb-1">
                  Image URL prefix
                </label>
                <input
                  type="text"
                  value={settings.imageUrlPrefix}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, imageUrlPrefix: e.target.value }))
                  }
                  placeholder="/images"
                  className="w-full px-3 py-2 border border-border rounded-md text-[13px] bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-fg/10 focus:border-fg/20"
                />
                <p className="text-xs text-fg-tertiary mt-1">
                  The path prefix written into your markdown. For Next.js, images in public/ are served from / so set this to /images not /public/images.
                </p>
              </div>

              {/* Advanced */}
              <button
                onClick={() => setAdvancedOpen((v) => !v)}
                className="text-sm text-fg-tertiary cursor-pointer hover:text-fg-secondary transition-colors"
              >
                {advancedOpen ? "▾" : "▸"} Advanced
              </button>

              {advancedOpen && (
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="organizeByFolder"
                    checked={settings.organizeByFolder}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, organizeByFolder: e.target.checked }))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-border accent-fg"
                  />
                  <div>
                    <label
                      htmlFor="organizeByFolder"
                      className="text-sm font-medium text-fg-secondary cursor-pointer"
                    >
                      Organize by content folder
                    </label>
                    <p className="text-xs text-fg-tertiary mt-0.5">
                      Automatically sort images into subfolders matching the content folder. Images added to content/blog/ posts go into public/images/blog/
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Frontmatter picklists section */}
          <div className="pt-4 border-t border-border-secondary">
            <h2 className="text-sm font-semibold text-fg mb-1">
              Frontmatter picklists
            </h2>
            <p className="text-xs text-fg-tertiary mb-4">
              Constrain frontmatter fields to a predefined list of values.
              When a file&apos;s frontmatter uses one of these field names,
              editors will pick from a dropdown.
            </p>

            <FrontmatterPicklistsEditor
              picklists={settings.frontmatterPicklists}
              onChange={(picklists) =>
                setSettings((s) => ({ ...s, frontmatterPicklists: picklists }))
              }
            />
          </div>

          <div className="pt-4 border-t border-border-secondary">
            <Button onClick={handleSave} loading={saving}>
              Save settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Frontmatter Picklists Editor ───────────────────────────────────────────

function FrontmatterPicklistsEditor({
  picklists,
  onChange,
}: {
  picklists: Record<string, string[]>;
  onChange: (picklists: Record<string, string[]>) => void;
}) {
  const [newKey, setNewKey] = useState("");

  const entries = Object.entries(picklists);

  const addPicklist = () => {
    const key = newKey.trim();
    if (!key) return;
    if (picklists[key]) {
      toast.error(`A picklist for "${key}" already exists`);
      return;
    }
    onChange({ ...picklists, [key]: [] });
    setNewKey("");
  };

  const removePicklist = (key: string) => {
    const next = { ...picklists };
    delete next[key];
    onChange(next);
  };

  const updateOptions = (key: string, options: string[]) => {
    onChange({ ...picklists, [key]: options });
  };

  const handleNewKeyKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addPicklist();
    }
  };

  return (
    <div className="space-y-4">
      {entries.length === 0 && (
        <p className="text-xs text-fg-tertiary italic">
          No picklists yet. Add one below.
        </p>
      )}

      {entries.map(([key, options]) => (
        <PicklistRow
          key={key}
          fieldKey={key}
          options={options}
          onChange={(next) => updateOptions(key, next)}
          onRemove={() => removePicklist(key)}
        />
      ))}

      <div className="flex items-center gap-2 pt-2 border-t border-border-secondary">
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={handleNewKeyKeyDown}
          placeholder="Field name (e.g. status, category)"
          className="flex-1 px-3 py-2 border border-border rounded-md text-[13px] bg-surface text-fg font-mono focus:outline-none focus:ring-2 focus:ring-fg/10 focus:border-fg/20"
        />
        <button
          type="button"
          onClick={addPicklist}
          disabled={!newKey.trim()}
          className={cn(
            "inline-flex items-center gap-1 px-3 py-2 rounded-md text-[13px] font-medium transition-colors",
            newKey.trim()
              ? "bg-accent text-white hover:bg-accent-hover cursor-pointer"
              : "bg-bg-muted text-fg-tertiary cursor-not-allowed"
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          Add picklist
        </button>
      </div>
    </div>
  );
}

function PicklistRow({
  fieldKey,
  options,
  onChange,
  onRemove,
}: {
  fieldKey: string;
  options: string[];
  onChange: (next: string[]) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState("");

  const addOption = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (options.includes(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...options, trimmed]);
    setDraft("");
  };

  const removeOption = (idx: number) => {
    onChange(options.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
      e.preventDefault();
      addOption(draft);
    }
    if (e.key === "Backspace" && !draft && options.length > 0) {
      removeOption(options.length - 1);
    }
  };

  return (
    <div className="border border-border rounded-md p-3 bg-surface-secondary">
      <div className="flex items-center justify-between mb-2">
        <code className="text-[13px] font-mono font-medium text-fg-secondary">
          {fieldKey}
        </code>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-fg-tertiary hover:text-red-500 cursor-pointer transition-colors"
          aria-label={`Remove ${fieldKey} picklist`}
        >
          Remove picklist
        </button>
      </div>

      {options.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {options.map((opt, idx) => (
            <span
              key={`${opt}-${idx}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-accent-subtle text-accent border-accent-border text-xs"
            >
              {opt}
              <button
                type="button"
                onClick={() => removeOption(idx)}
                className="cursor-pointer text-text-secondary hover:text-text-primary transition-colors"
                aria-label={`Remove option ${opt}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (draft.trim()) addOption(draft);
        }}
        placeholder="Add option, press Enter"
        className="w-full px-2.5 py-1.5 border border-border rounded text-[13px] bg-surface text-fg placeholder:text-fg-tertiary focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-colors"
      />
    </div>
  );
}
