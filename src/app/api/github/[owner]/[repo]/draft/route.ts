import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOctokitForRepo, clearDraftBranch } from "@/lib/github-app";
import { prisma } from "@/lib/prisma";
import { githubErrorResponse } from "@/lib/utils";

type DraftFileStatus = "added" | "modified" | "removed" | "renamed";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized", actionable: "Sign in to continue." },
      { status: 401 }
    );
  }

  const { owner, repo } = await params;

  const settings = await prisma.repoSettings.findUnique({
    where: { repoOwner_repoName: { repoOwner: owner, repoName: repo } },
  });
  const baseBranch = settings?.defaultBranch ?? "main";

  const draft = await prisma.draftBranch.findUnique({
    where: {
      userId_repoOwner_repoName: {
        userId: session.user.id,
        repoOwner: owner,
        repoName: repo,
      },
    },
  });

  if (!draft) {
    return NextResponse.json({ branch: null, baseBranch, files: [] });
  }

  try {
    const octokit = await getOctokitForRepo(owner);

    // If a PR is already open from this branch, treat the draft as resolved.
    const { data: openPRs } = await octokit.rest.pulls.list({
      owner,
      repo,
      head: `${owner}:${draft.branch}`,
      state: "open",
      per_page: 1,
    });
    if (openPRs.length > 0) {
      await clearDraftBranch({ userId: session.user.id, owner, repo });
      return NextResponse.json({ branch: null, baseBranch, files: [] });
    }

    const { data: compare } = await octokit.rest.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${draft.baseBranch}...${draft.branch}`,
    });

    const files = (compare.files ?? []).map((f) => ({
      path: f.filename,
      status: f.status as DraftFileStatus,
      previousPath: f.previous_filename,
      additions: f.additions ?? 0,
      deletions: f.deletions ?? 0,
    }));

    const commits = (compare.commits ?? []).slice(-50).map((c) => ({
      sha: c.sha.slice(0, 7),
      message: (c.commit?.message ?? "").split("\n")[0],
    }));

    const totals = {
      additions: files.reduce((sum, f) => sum + f.additions, 0),
      deletions: files.reduce((sum, f) => sum + f.deletions, 0),
      commits: compare.total_commits ?? commits.length,
    };

    return NextResponse.json({
      branch: draft.branch,
      baseBranch: draft.baseBranch,
      files,
      commits,
      totals,
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("404") || error.message.includes("Not Found"))) {
      // Branch was deleted on GitHub — self-heal by clearing the record.
      await clearDraftBranch({ userId: session.user.id, owner, repo });
      return NextResponse.json({ branch: null, baseBranch, files: [] });
    }
    return githubErrorResponse(error, { route: "draft", owner, repo });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized", actionable: "Sign in to continue." },
      { status: 401 }
    );
  }

  const { owner, repo } = await params;

  const draft = await prisma.draftBranch.findUnique({
    where: {
      userId_repoOwner_repoName: {
        userId: session.user.id,
        repoOwner: owner,
        repoName: repo,
      },
    },
  });

  if (!draft) {
    return NextResponse.json({ ok: true });
  }

  try {
    const octokit = await getOctokitForRepo(owner);
    await octokit.rest.git
      .deleteRef({ owner, repo, ref: `heads/${draft.branch}` })
      .catch(() => {});
  } catch {
    // Even if branch deletion fails (already gone, etc), clear the record so the user can start fresh.
  }

  await clearDraftBranch({ userId: session.user.id, owner, repo });
  return NextResponse.json({ ok: true });
}
