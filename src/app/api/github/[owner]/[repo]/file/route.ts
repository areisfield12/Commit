import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOctokitForRepo } from "@/lib/github-app";
import { githubErrorResponse, decodeBase64 } from "@/lib/utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized", actionable: "Sign in to continue." }, { status: 401 });
  }

  const { owner, repo } = await params;
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  const ref = searchParams.get("ref") ?? undefined;

  if (!path) {
    return NextResponse.json(
      { error: "Missing path", actionable: "Provide a file path to load." },
      { status: 400 }
    );
  }

  try {
    const octokit = await getOctokitForRepo(owner);

    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if (Array.isArray(data) || data.type !== "file") {
      return NextResponse.json(
        { error: "Not a file", actionable: "The path points to a directory, not a file." },
        { status: 400 }
      );
    }

    const content = decodeBase64(data.content);

    // Also fetch the last commit for this file
    let lastCommit = null;
    try {
      const { data: commits } = await octokit.rest.repos.listCommits({
        owner,
        repo,
        path,
        per_page: 1,
        sha: ref,
      });
      if (commits.length > 0) {
        const c = commits[0];
        lastCommit = {
          sha: c.sha,
          message: c.commit.message,
          author: c.commit.author?.name ?? c.author?.login ?? "Unknown",
          date: c.commit.author?.date ?? new Date().toISOString(),
        };
      }
    } catch {
      // Non-fatal — last commit info is supplementary
    }

    return NextResponse.json({
      path: data.path,
      content,
      sha: data.sha,
      size: data.size,
      lastCommit,
    });
  } catch (error) {
    return githubErrorResponse(error, { route: "file", owner, repo, path, ref });
  }
}
