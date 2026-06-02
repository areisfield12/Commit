import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOctokitForRepo, getOrCreateDraftBranch } from "@/lib/github-app";
import { prisma } from "@/lib/prisma";
import { githubErrorResponse, encodeBase64 } from "@/lib/utils";

interface NewFileBody {
  path: string;
  title: string;
}

export async function POST(
  request: NextRequest,
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

  let body: NewFileBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request", actionable: "Please try again." },
      { status: 400 }
    );
  }

  const { path, title } = body;

  if (!path || !title?.trim()) {
    return NextResponse.json(
      {
        error: "Missing required fields",
        actionable: "Please provide a title for the new file.",
      },
      { status: 400 }
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const content = `---
title: "${title.trim()}"
date: ${today}
author: ""
tags: []
published: false
description: ""
---

`;

  try {
    const octokit = await getOctokitForRepo(owner);

    const settings = await prisma.repoSettings.findUnique({
      where: { repoOwner_repoName: { repoOwner: owner, repoName: repo } },
    });
    const requirePR = settings?.requirePR ?? true;

    let targetBranch: string | undefined;
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

    // Check if file already exists on the target ref (default branch when undefined)
    try {
      await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref: targetBranch,
      });
      return NextResponse.json(
        {
          error: "File already exists",
          actionable:
            "A file with this name already exists in this folder. Try a different title.",
        },
        { status: 409 }
      );
    } catch (checkError: unknown) {
      if (
        checkError instanceof Error &&
        !checkError.message.includes("Not Found") &&
        !checkError.message.includes("404")
      ) {
        throw checkError;
      }
    }

    const slug = path.split("/").pop() ?? path;
    const commitMessage = `Create ${slug}`;

    const { data } = await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: commitMessage,
      content: encodeBase64(content),
      branch: targetBranch,
    });

    return NextResponse.json({
      path,
      sha: data.content?.sha,
      commitSha: data.commit.sha,
      url: data.commit.html_url,
      branch: targetBranch ?? null,
    });
  } catch (error) {
    return githubErrorResponse(error, { route: "new-file", owner, repo, path });
  }
}
