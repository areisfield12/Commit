import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOctokitForRepo } from "@/lib/github-app";
import { githubErrorResponse } from "@/lib/utils";
import { getFileCategory, isMarkdownFile } from "@/lib/file-types";
import { FileNode } from "@/types";

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
  const ref = searchParams.get("ref") ?? undefined;

  try {
    const octokit = await getOctokitForRepo(owner);

    // Fetch the full git tree recursively
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
    const branch = ref ?? repoData.default_branch;

    const { data: tree } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      recursive: "1",
    });

    // Filter to markdown files only
    const markdownFiles: FileNode[] = (tree.tree ?? [])
      .filter(
        (item) =>
          item.type === "blob" &&
          item.path &&
          isMarkdownFile(item.path)
      )
      .map((item) => {
        const path = item.path!;
        const parts = path.split("/");
        return {
          path,
          name: parts[parts.length - 1],
          type: "file" as const,
          sha: item.sha ?? "",
          size: item.size,
          category: getFileCategory(path),
        };
      })
      .sort((a, b) => {
        // Sort: agent configs first, then alphabetically
        const categoryOrder = { agent: 0, style: 1, gtm: 2, doc: 3 };
        const aOrder = categoryOrder[a.category ?? "doc"];
        const bOrder = categoryOrder[b.category ?? "doc"];
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.path.localeCompare(b.path);
      });

    return NextResponse.json({ files: markdownFiles, branch });
  } catch (error) {
    return githubErrorResponse(error, { route: "files", owner, repo });
  }
}
