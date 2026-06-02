import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Octokit } from "octokit";
import { authOptions } from "@/lib/auth";
import { getGitHubApp } from "@/lib/github-app";
import { prisma } from "@/lib/prisma";
import { formatGitHubError } from "@/lib/utils";
import { RepoInfo } from "@/types";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized", actionable: "Sign in to continue." }, { status: 401 });
  }

  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "github" },
    select: { access_token: true },
  });
  if (!account?.access_token) {
    return NextResponse.json(
      { error: "GitHub session expired", actionable: "Sign out and sign back in to reconnect GitHub." },
      { status: 401 },
    );
  }

  try {
    const app = getGitHubApp();

    // Ask GitHub which installations this user can see (personal + orgs they belong to).
    const userOctokit = new Octokit({ auth: account.access_token });
    const { data } = await userOctokit.rest.apps.listInstallationsForAuthenticatedUser({
      per_page: 100,
    });
    const userInstallations = data.installations;

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
    const friendly = formatGitHubError(error);
    return NextResponse.json(friendly, { status: 500 });
  }
}
