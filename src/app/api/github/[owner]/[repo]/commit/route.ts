import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOctokitForRepo, getOrCreateDraftBranch } from "@/lib/github-app";
import { prisma } from "@/lib/prisma";
import { githubErrorResponse, encodeBase64 } from "@/lib/utils";

interface CommitBody {
  path: string;
  content: string;
  sha: string;
  branch: string;
  message?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized", actionable: "Sign in to continue." }, { status: 401 });
  }

  const { owner, repo } = await params;

  let body: CommitBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request", actionable: "Please try again." }, { status: 400 });
  }

  const { path, content, sha, branch, message } = body;

  if (!path || !content || !sha || !branch) {
    return NextResponse.json(
      { error: "Missing required fields", actionable: "Reload the page and try again." },
      { status: 400 }
    );
  }

  try {
    const octokit = await getOctokitForRepo(owner);

    // In PR-required mode, transparently route every commit to the user's
    // draft branch, regardless of which branch the client passed.
    const settings = await prisma.repoSettings.findUnique({
      where: { repoOwner_repoName: { repoOwner: owner, repoName: repo } },
    });
    const requirePR = settings?.requirePR ?? true;

    let targetBranch = branch;
    if (requirePR) {
      const draft = await getOrCreateDraftBranch({
        userId: session.user.id,
        owner,
        repo,
        githubLogin: session.user.githubLogin ?? "user",
        filePath: path,
      });
      targetBranch = draft.branch;
    }

    const filename = path.split("/").pop() ?? path;
    const commitMessage = message ?? `Update ${filename} via Commit`;

    const { data } = await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: commitMessage,
      content: encodeBase64(content),
      sha,
      branch: targetBranch,
    });

    return NextResponse.json({
      sha: data.commit.sha,
      url: data.commit.html_url,
      message: commitMessage,
      fileSha: data.content?.sha,
      branch: targetBranch,
    });
  } catch (error) {
    return githubErrorResponse(error, { route: "commit", owner, repo, path, branch });
  }
}
