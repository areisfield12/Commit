import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { NextResponse } from "next/server";
import { ApiError } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Pull a status code off an Octokit / fetch error. Returns 500 when unknown.
 */
function extractStatus(error: unknown): number {
  if (error && typeof error === "object" && "status" in error) {
    const s = (error as { status?: unknown }).status;
    if (typeof s === "number" && s >= 400 && s < 600) return s;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("404") || msg.includes("not found")) return 404;
    if (msg.includes("401") || msg.includes("unauthorized")) return 401;
    if (msg.includes("403") || msg.includes("forbidden")) return 403;
    if (msg.includes("409") || msg.includes("conflict")) return 409;
    if (msg.includes("422")) return 422;
    if (msg.includes("rate limit")) return 429;
  }
  return 500;
}

/**
 * Centralized error response for GitHub API route handlers. Logs the raw
 * error (so Vercel function logs capture the upstream GitHub status, ref,
 * path, etc.), preserves the upstream HTTP status code, and returns a
 * user-friendly JSON body.
 */
export function githubErrorResponse(
  error: unknown,
  context: Record<string, unknown> = {}
): NextResponse {
  const status = extractStatus(error);
  const rawMessage =
    error instanceof Error ? error.message : String(error);

  // Server-side log — surfaces in Vercel function logs for debugging.
  console.error("[github route error]", {
    ...context,
    status,
    message: rawMessage,
  });

  return NextResponse.json(formatGitHubError(error), { status });
}

/**
 * Format a GitHub API error into a user-friendly message.
 */
export function formatGitHubError(error: unknown): ApiError {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    if (msg.includes("rate limit")) {
      return {
        error: "GitHub API rate limit reached",
        actionable: "You've hit GitHub's rate limit. Wait a minute and try again.",
      };
    }
    if (msg.includes("not found") || msg.includes("404")) {
      return {
        error: "File or repository not found",
        actionable:
          "The file or repository may have been deleted or you may not have access.",
      };
    }
    if (msg.includes("conflict") || msg.includes("422")) {
      return {
        error: "Conflict detected",
        actionable:
          "Someone else may have edited this file. Refresh to get the latest version.",
      };
    }
    if (msg.includes("401") || msg.includes("unauthorized")) {
      return {
        error: "GitHub access expired",
        actionable: "Sign out and sign back in to refresh your GitHub access.",
      };
    }
    if (msg.includes("Commit is not installed")) {
      return {
        error: "Commit app not installed",
        actionable:
          "Install the Commit GitHub App on this repository or organization to continue.",
      };
    }
  }

  return {
    error: "Something went wrong",
    actionable: "An unexpected error occurred. Please try again.",
  };
}

/**
 * Decode base64-encoded GitHub file content.
 */
export function decodeBase64(encoded: string): string {
  return Buffer.from(encoded, "base64").toString("utf-8");
}

/**
 * Encode a string to base64 for GitHub API.
 */
export function encodeBase64(content: string): string {
  return Buffer.from(content, "utf-8").toString("base64");
}

/**
 * Generate a branch name for Commit PRs.
 * Format: commit/username/filename-timestamp
 */
export function generateBranchName(githubLogin: string, filePath: string): string {
  const filename = filePath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "file";
  const sanitized = filename.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const timestamp = Date.now();
  return `commit/${githubLogin}/${sanitized}-${timestamp}`;
}

/**
 * Convert a markdown filename to a human-readable display name.
 * Strips extension, date prefix, replaces separators, and title-cases.
 * Example: "2025-07-28-five-ways-to-automate.md" → "Five Ways to Automate"
 */
export function filePathToDisplayName(filename: string): string {
  let name = filename.replace(/\.(md|mdx)$/, "");
  name = name.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  name = name.replace(/[-_]/g, " ");
  name = name.replace(/\b\w/g, (c) => c.toUpperCase());
  return name;
}

/**
 * Format a commit timestamp as a relative time string (e.g., "3 days ago").
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}
