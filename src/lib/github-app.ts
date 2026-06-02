import { App, Octokit } from "octokit";
import { prisma } from "@/lib/prisma";

// GitHub App singleton (server-side only)
let _githubApp: App | null = null;

function getGitHubApp(): App {
  if (_githubApp) return _githubApp;

  if (!process.env.GITHUB_APP_ID || !process.env.GITHUB_APP_PRIVATE_KEY) {
    throw new Error(
      "GitHub App not configured. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY in .env.local"
    );
  }

  _githubApp = new App({
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"),
    oauth: {
      clientId: process.env.GITHUB_APP_CLIENT_ID!,
      clientSecret: process.env.GITHUB_APP_CLIENT_SECRET!,
    },
  });

  return _githubApp;
}

export { getGitHubApp };

/**
 * Get an installation-scoped Octokit instance for a specific installation.
 * This is used for all read/write operations on repos.
 */
export async function getInstallationOctokit(
  installationId: number
): Promise<Octokit> {
  const app = getGitHubApp();
  return app.getInstallationOctokit(installationId);
}

/**
 * Find the installation ID for a given owner (user or org).
 * Returns null if the app is not installed for that owner.
 */
export async function getInstallationIdForOwner(
  owner: string
): Promise<number | null> {
  try {
    const app = getGitHubApp();
    const { data: installation } =
      await app.octokit.rest.apps.getUserInstallation({ username: owner });
    return installation.id;
  } catch {
    try {
      const app = getGitHubApp();
      const { data: installation } =
        await app.octokit.rest.apps.getOrgInstallation({ org: owner });
      return installation.id;
    } catch {
      return null;
    }
  }
}

/**
 * Get Octokit for a repo owner. Throws a user-friendly error if app is not installed.
 */
export async function getOctokitForRepo(owner: string): Promise<Octokit> {
  const installationId = await getInstallationIdForOwner(owner);
  if (!installationId) {
    throw new Error(
      `Commit is not installed on ${owner}. Please install the GitHub App to continue.`
    );
  }
  return getInstallationOctokit(installationId);
}

/**
 * Resolve the user's active draft branch for (owner, repo), creating one if needed.
 * Reuses an existing draft branch when it still exists on GitHub and has no open PR.
 * Otherwise creates a fresh branch off the repo's default branch and persists it.
 */
export async function getOrCreateDraftBranch(params: {
  userId: string;
  owner: string;
  repo: string;
  githubLogin: string;
}): Promise<{ branch: string; baseBranch: string }> {
  const { userId, owner, repo, githubLogin } = params;
  const octokit = await getOctokitForRepo(owner);

  const settings = await prisma.repoSettings.findUnique({
    where: { repoOwner_repoName: { repoOwner: owner, repoName: repo } },
  });
  const baseBranch = settings?.defaultBranch ?? "main";

  const existing = await prisma.draftBranch.findUnique({
    where: { userId_repoOwner_repoName: { userId, repoOwner: owner, repoName: repo } },
  });

  if (existing) {
    let branchExists = true;
    try {
      await octokit.rest.git.getRef({ owner, repo, ref: `heads/${existing.branch}` });
    } catch {
      branchExists = false;
    }

    let hasOpenPR = false;
    if (branchExists) {
      try {
        const { data: prs } = await octokit.rest.pulls.list({
          owner,
          repo,
          head: `${owner}:${existing.branch}`,
          state: "open",
          per_page: 1,
        });
        hasOpenPR = prs.length > 0;
      } catch {
        // Treat as no open PR — listing is best-effort
      }
    }

    if (branchExists && !hasOpenPR) {
      return { branch: existing.branch, baseBranch: existing.baseBranch };
    }

    await prisma.draftBranch.delete({ where: { id: existing.id } }).catch(() => {});
  }

  const { data: baseRef } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });

  const safeLogin = (githubLogin || "user").toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const branch = `commit/${safeLogin}/draft-${Date.now().toString(36)}`;

  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha: baseRef.object.sha,
  });

  await prisma.draftBranch.create({
    data: { userId, repoOwner: owner, repoName: repo, branch, baseBranch },
  });

  return { branch, baseBranch };
}

/**
 * Remove the user's draft branch record (e.g. after a PR has been opened).
 * Does not delete the underlying GitHub branch.
 */
export async function clearDraftBranch(params: {
  userId: string;
  owner: string;
  repo: string;
}): Promise<void> {
  const { userId, owner, repo } = params;
  await prisma.draftBranch
    .delete({
      where: { userId_repoOwner_repoName: { userId, repoOwner: owner, repoName: repo } },
    })
    .catch(() => {});
}
