import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOctokitForRepo } from "@/lib/github-app";
import { githubErrorResponse } from "@/lib/utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized", actionable: "Sign in to continue." }, { status: 401 });
  }

  const { owner, repo } = await params;

  try {
    const octokit = await getOctokitForRepo(owner);

    // Fetch open + closed PRs with heads starting with "commit/"
    const [open, closed] = await Promise.all([
      octokit.rest.pulls.list({ owner, repo, state: "open", per_page: 50 }),
      octokit.rest.pulls.list({ owner, repo, state: "closed", per_page: 20 }),
    ]);

    const allPRs = [...open.data, ...closed.data].filter((pr) =>
      pr.head.ref.startsWith("commit/")
    );

    return NextResponse.json({ prs: allPRs });
  } catch (error) {
    return githubErrorResponse(error, { route: "prs", owner, repo });
  }
}
