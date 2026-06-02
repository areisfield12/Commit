"use client";

import { useState, useEffect, useCallback } from "react";
import { GitHubFile, FrontmatterData } from "@/types";
import { prepareFileForEditor, buildRawMarkdown } from "@/lib/markdown";

interface UseGitHubFileOptions {
  owner: string;
  repo: string;
  path: string;
  branch?: string;
  imageStorageFolder?: string;
  imageUrlPrefix?: string;
}

interface UseGitHubFileResult {
  loading: boolean;
  error: string | null;
  sha: string | null;
  branch: string;
  bodyHtml: string;
  rawMarkdown: string;
  frontmatterData: FrontmatterData;
  hasFrontmatter: boolean;
  lastCommit: GitHubFile["sha"] | null;
  // Actions
  setBodyHtml: (html: string) => void;
  setFrontmatterData: (data: FrontmatterData) => void;
  getCurrentRaw: () => string;
  reload: () => void;
}

// Collapse "./" and "../" segments against a base directory, mirroring how
// GitHub renders relative paths in markdown.
function resolveRepoPath(dir: string, relativeSrc: string): string {
  const baseParts = dir ? dir.split("/").filter(Boolean) : [];
  const relParts = relativeSrc.split("/");

  for (const part of relParts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      baseParts.pop();
      continue;
    }
    baseParts.push(part);
  }

  return baseParts.join("/");
}

/**
 * Rewrite every relative image src in the loaded HTML to point at our image
 * proxy endpoint, so images stored anywhere in the repo render in the editor
 * regardless of how the original author wrote the path.
 *
 * Sets `data-markdown-src` to the original src so Turndown's commitImage rule
 * round-trips the markdown unchanged on save.
 */
function rewriteRelativeImageSrcs(
  html: string,
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
  imageStorageFolder: string,
  imageUrlPrefix: string
): string {
  if (!html || typeof window === "undefined") return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const imgs = doc.querySelectorAll("img");

  const docDir = filePath.includes("/")
    ? filePath.slice(0, filePath.lastIndexOf("/"))
    : "";
  // Normalize the configured prefix so a trailing slash doesn't break matching.
  const prefix = imageUrlPrefix.endsWith("/")
    ? imageUrlPrefix.slice(0, -1)
    : imageUrlPrefix;
  const storage = imageStorageFolder.endsWith("/")
    ? imageStorageFolder.slice(0, -1)
    : imageStorageFolder;

  imgs.forEach((img) => {
    const src = img.getAttribute("src");
    if (!src) return;
    // Already processed (just-inserted upload, or prior rewrite).
    if (img.getAttribute("data-markdown-src")) return;
    // Leave absolute URLs, data/blob URLs, anchors, and mail links alone.
    if (/^(https?:|data:|blob:|mailto:|#)/i.test(src)) return;

    let repoPath: string;
    if (prefix && (src === prefix || src.startsWith(prefix + "/"))) {
      // Configured URL prefix → storage folder mapping (existing behavior).
      const relativePart = src.slice(prefix.length);
      repoPath = `${storage}${relativePart}`;
    } else if (src.startsWith("/")) {
      // Repo-absolute path.
      repoPath = src.slice(1);
    } else {
      // Relative to the document's directory.
      repoPath = resolveRepoPath(docDir, src);
    }

    if (!repoPath) return;

    const proxyUrl = `/api/github/${owner}/${repo}/image?path=${encodeURIComponent(repoPath)}&ref=${encodeURIComponent(branch)}`;
    img.setAttribute("data-markdown-src", src);
    img.setAttribute("src", proxyUrl);
  });

  return doc.body.innerHTML;
}

export function useGitHubFile({
  owner,
  repo,
  path,
  branch,
  imageStorageFolder = "public/images",
  imageUrlPrefix = "/images",
}: UseGitHubFileOptions): UseGitHubFileResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sha, setSha] = useState<string | null>(null);
  const [currentBranch, setCurrentBranch] = useState(branch ?? "main");
  const [bodyHtml, setBodyHtml] = useState("");
  const [rawMarkdown, setRawMarkdown] = useState("");
  const [frontmatterData, setFrontmatterData] = useState<FrontmatterData>({});
  const [hasFrontmatter, setHasFrontmatter] = useState(false);
  const [lastCommit, setLastCommit] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ path });
    if (branch) params.set("ref", branch);

    fetch(`/api/github/${owner}/${repo}/file?${params}`)
      .then((r) => r.json())
      .then(async (data) => {
        if (data.error) {
          setError(data.actionable ?? data.error);
          return;
        }

        setSha(data.sha);
        setLastCommit(data.lastCommit?.sha ?? null);
        if (data.lastCommit?.sha) {
          setCurrentBranch(branch ?? "main");
        }
        setRawMarkdown(data.content);

        // Parse frontmatter and convert body to HTML
        const prepared = await prepareFileForEditor(data.content);
        const rewrittenHtml = rewriteRelativeImageSrcs(
          prepared.bodyHtml,
          owner,
          repo,
          branch ?? "main",
          path,
          imageStorageFolder,
          imageUrlPrefix
        );
        setBodyHtml(rewrittenHtml);
        setFrontmatterData(prepared.frontmatterData);
        setHasFrontmatter(prepared.hasFrontmatter);
      })
      .catch(() => setError("Failed to load file. Check your connection."))
      .finally(() => setLoading(false));
  }, [owner, repo, path, branch, reloadKey, imageStorageFolder, imageUrlPrefix]);

  const getCurrentRaw = useCallback((): string => {
    return buildRawMarkdown(frontmatterData, bodyHtml);
  }, [frontmatterData, bodyHtml]);

  return {
    loading,
    error,
    sha,
    branch: currentBranch,
    bodyHtml,
    rawMarkdown,
    frontmatterData,
    hasFrontmatter,
    lastCommit,
    setBodyHtml,
    setFrontmatterData,
    getCurrentRaw,
    reload,
  };
}
