import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOctokitForRepo, clearDraftBranch } from "@/lib/github-app";
import { prisma } from "@/lib/prisma";
import { formatGitHubError, encodeBase64, generateBranchName } from "@/lib/utils";

interface PRBody {
  // Single-file mode (legacy): commits one file to a fresh branch, then opens PR
  path?: string;
  content?: string;
  sha?: string;
  // Draft mode: opens PR from the caller's existing draft branch (no new commits)
  mode?: "draft";
  baseBranch: string;
  title: string;
  body: string;
  reviewers?: string[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.githubLogin) {
    return NextResponse.json({ error: "Unauthorized", actionable: "Sign in to continue." }, { status: 401 });
  }

  const { owner, repo } = await params;

  let body: PRBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request", actionable: "Please try again." }, { status: 400 });
  }

  const { path, content, sha: fileSha, mode, baseBranch, title, body: prBody, reviewers } = body;

  if (!baseBranch || !title) {
    return NextResponse.json(
      { error: "Missing required fields", actionable: "Fill in all required fields and try again." },
      { status: 400 }
    );
  }

  const octokit = await getOctokitForRepo(owner);

  try {
    let branchName: string;

    if (mode === "draft") {
      // Open a PR from the user's existing draft branch (which already has commits).
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
        return NextResponse.json(
          {
            error: "No pending changes",
            actionable: "Make at least one change before proposing.",
          },
          { status: 400 }
        );
      }
      branchName = draft.branch;
    } else {
      // Legacy single-file flow: branch + one commit + PR
      if (!path || !content || !fileSha) {
        return NextResponse.json(
          { error: "Missing required fields", actionable: "Fill in all required fields and try again." },
          { status: 400 }
        );
      }

      const { data: baseRef } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${baseBranch}`,
      });
      const baseSha = baseRef.object.sha;

      branchName = generateBranchName(session.user.githubLogin ?? "user", path);

      await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      });

      const filename = path.split("/").pop() ?? path;
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: `Update ${filename} via Commit`,
        content: encodeBase64(content),
        sha: fileSha,
        branch: branchName,
      });
    }

    const { data: pr } = await octokit.rest.pulls.create({
      owner,
      repo,
      title,
      body: prBody,
      head: branchName,
      base: baseBranch,
    });

    if (reviewers && reviewers.length > 0) {
      try {
        await octokit.rest.pulls.requestReviewers({
          owner,
          repo,
          pull_number: pr.number,
          reviewers,
        });
      } catch {
        // Non-fatal — PR was created, reviewer assignment just failed
      }
    }

    if (mode === "draft") {
      await clearDraftBranch({ userId: session.user.id, owner, repo });
    }

    return NextResponse.json({
      number: pr.number,
      url: pr.html_url,
      title: pr.title,
      branchName,
    });
  } catch (error) {
    const friendly = formatGitHubError(error);
    return NextResponse.json(friendly, { status: 500 });
  }
}
