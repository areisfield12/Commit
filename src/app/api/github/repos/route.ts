import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Octokit } from "octokit";
import { authOptions } from "@/lib/auth";
import { getGitHubApp } from "@/lib/github-app";
import { getValidGitHubUserToken } from "@/lib/github-oauth";
import { formatGitHubError } from "@/lib/utils";
import { RepoInfo } from "@/types";

const REAUTH_RESPONSE = {
  error: "GitHub session expired",
  actionable: "Sign out and sign back in to reconnect GitHub.",
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized", actionable: "Sign in to continue." }, { status: 401 });
  }

  const accessToken = await getValidGitHubUserToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json(REAUTH_RESPONSE, { status: 401 });
  }

  const userLogin = session.user.githubLogin?.toLowerCase() ?? null;

  try {
    const app = getGitHubApp();

    // Ask GitHub which installations this user can see (personal + orgs they belong to).
    const userOctokit = new Octokit({ auth: accessToken });
    const { data } = await userOctokit.rest.apps.listInstallationsForAuthenticatedUser({
      per_page: 100,
    });

    // GitHub returns User-type installs from other people the user has any collab
    // access to. We only want the user's OWN personal install + every org install.
    const userInstallations = data.installations.filter((inst) => {
      const accountType = inst.account && "type" in inst.account ? inst.account.type : null;
      if (accountType === "Organization") return true;
      const accountLogin = inst.account && "login" in inst.account ? inst.account.login : null;
      return accountLogin && userLogin && accountLogin.toLowerCase() === userLogin;
    });

    const repos: RepoInfo[] = [];

    for (const installation of userInstallations) {
      const installationOctokit = await app.getInstallationOctokit(installation.id);

      // List repos accessible for this installation
      const repoPages = installationOctokit.paginate.iterator(
        installationOctokit.rest.apps.listReposAccessibleToInstallation,
        { per_page: 100 }
      );

      for await (const { data: pageRepos } of repoPages) {
        for (const repo of pageRepos) {
          repos.push({
            owner: repo.owner.login,
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description,
            defaultBranch: repo.default_branch,
            private: repo.private,
            stargazersCount: repo.stargazers_count,
            updatedAt: repo.updated_at ?? new Date().toISOString(),
            installationId: installation.id,
          });
        }
      }
    }

    // Sort by last updated
    repos.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return NextResponse.json({ repos });
  } catch (error) {
    console.error("[/api/github/repos] failed:", error);
    if ((error as { status?: number })?.status === 401) {
      return NextResponse.json(REAUTH_RESPONSE, { status: 401 });
    }
    const friendly = formatGitHubError(error);
    return NextResponse.json(friendly, { status: 500 });
  }
}
