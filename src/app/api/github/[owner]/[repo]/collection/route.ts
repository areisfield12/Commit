import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOctokitForRepo } from "@/lib/github-app";
import { githubErrorResponse, decodeBase64 } from "@/lib/utils";
import { extractFrontmatter } from "@/lib/markdown";
import { isMarkdownFile } from "@/lib/file-types";

interface CollectionFile {
  path: string;
  title: string;
  date: string | null;
  author: string | null;
  published: boolean | null;
  lastModified: string | null;
}

// GET /api/github/[owner]/[repo]/collection?folderPath=/content/blog
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
  const folderPath = searchParams.get("folderPath");
  const ref = searchParams.get("ref") ?? undefined;

  if (!folderPath) {
    return NextResponse.json(
      { error: "Missing folderPath", actionable: "Provide a folderPath query parameter." },
      { status: 400 }
    );
  }

  try {
    const octokit = await getOctokitForRepo(owner);

    const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
    const branch = ref ?? repoData.default_branch;

    // Get folder contents
    const { data: contents } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: folderPath.replace(/^\//, ""),
      ref: branch,
    });

    if (!Array.isArray(contents)) {
      return NextResponse.json(
        { error: "Not a folder", actionable: "The path points to a file, not a folder." },
        { status: 400 }
      );
    }

    // Filter to markdown files only
    const markdownEntries = contents.filter(
      (item) => item.type === "file" && isMarkdownFile(item.name)
    );

    // Fetch content and parse frontmatter for each file
    const files: CollectionFile[] = await Promise.all(
      markdownEntries.map(async (entry) => {
        let title = entry.name.replace(/\.(md|mdx)$/, "");
        let date: string | null = null;
        let author: string | null = null;
        let published: boolean | null = null;
        let lastModified: string | null = null;

        try {
          const { data: fileData } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: entry.path,
            ref: branch,
          });

          if (!Array.isArray(fileData) && fileData.type === "file") {
            const raw = decodeBase64(fileData.content);
            const { data: frontmatter } = extractFrontmatter(raw);

            if (typeof frontmatter.title === "string") title = frontmatter.title;
            if (frontmatter.date != null) date = String(frontmatter.date);
            if (typeof frontmatter.author === "string") author = frontmatter.author;
            if (typeof frontmatter.published === "boolean") published = frontmatter.published;
          }
        } catch {
          // Non-fatal — use defaults if file content can't be read
        }

        // Fetch last commit for this file
        try {
          const { data: commits } = await octokit.rest.repos.listCommits({
            owner,
            repo,
            path: entry.path,
            per_page: 1,
            sha: branch,
          });
          if (commits.length > 0 && commits[0].commit.author?.date) {
            lastModified = commits[0].commit.author.date;
          }
        } catch {
          // Non-fatal
        }

        return { path: entry.path, title, date, author, published, lastModified };
      })
    );

    // Sort by date descending (newest first), nulls last
    files.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return NextResponse.json({ files, branch });
  } catch (error) {
    return githubErrorResponse(error, { route: "collection", owner, repo });
  }
}
