import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOctokitForRepo } from "@/lib/github-app";

const CONTENT_TYPE_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

function contentTypeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPE_MAP[ext] ?? "application/octet-stream";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { owner, repo } = await params;
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  const ref = searchParams.get("ref") ?? undefined;

  if (!path) {
    return new NextResponse("Missing path", { status: 400 });
  }

  try {
    const octokit = await getOctokitForRepo(owner);
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ...(ref ? { ref } : {}),
    });

    const data = response.data;
    if (Array.isArray(data) || data.type !== "file") {
      return new NextResponse("Not a file", { status: 400 });
    }

    const buffer = Buffer.from(data.content, "base64");
    const contentType = contentTypeFromPath(path);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[github route error]", {
      route: "image",
      owner,
      repo,
      path,
      ref,
      message: error instanceof Error ? error.message : String(error),
    });
    return new NextResponse("Image not found", { status: 404 });
  }
}
