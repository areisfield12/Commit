import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOctokitForRepo } from "@/lib/github-app";
import { githubErrorResponse } from "@/lib/utils";

interface FolderNode {
  path: string;
  name: string;
  children: FolderNode[];
}

// GET /api/github/[owner]/[repo]/tree — return folder tree (folders only)
export async function GET(
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
  const { searchParams } = new URL(request.url);
  const ref = searchParams.get("ref") ?? undefined;

  try {
    const octokit = await getOctokitForRepo(owner);

    const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
    const branch = ref ?? repoData.default_branch;

    const { data: tree } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      recursive: "1",
    });

    // Extract only tree (folder) entries
    const folderPaths = (tree.tree ?? [])
      .filter((item) => item.type === "tree" && item.path)
      .map((item) => item.path!)
      .sort();

    // Build nested folder structure
    const root: FolderNode[] = [];
    const nodeMap = new Map<string, FolderNode>();

    for (const folderPath of folderPaths) {
      const parts = folderPath.split("/");
      const name = parts[parts.length - 1];
      const node: FolderNode = { path: folderPath, name, children: [] };
      nodeMap.set(folderPath, node);

      const parentPath = parts.slice(0, -1).join("/");
      const parent = parentPath ? nodeMap.get(parentPath) : undefined;

      if (parent) {
        parent.children.push(node);
      } else {
        root.push(node);
      }
    }

    return NextResponse.json({ folders: root, branch });
  } catch (error) {
    return githubErrorResponse(error, { route: "tree", owner, repo });
  }
}
