"use client";

import { useState } from "react";
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
