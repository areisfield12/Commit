import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOctokitForRepo, getOrCreateDraftBranch } from "@/lib/github-app";
import { githubErrorResponse } from "@/lib/utils";
import { prisma } from "@/lib/prisma";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

function slugifyFilename(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const base = name
    .replace(/\.[^.]+$/, "") // strip extension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // special chars to hyphens
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
  const timestamp = Date.now();
  return `${base}-${timestamp}.${ext}`;
}

function getSubfolder(contentPath: string): string {
  // contentPath e.g. "content/blog/my-post.md" → "blog"
  const parts = contentPath.split("/");
  if (parts.length >= 3) {
    // Return the second-level folder (after the top-level content folder)
    return parts.slice(1, -1).join("/");
  }
  return "";
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid request", actionable: "Please try again." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  const contentPath = formData.get("contentPath") as string | null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "No file provided", actionable: "Select an image file to upload." },
      { status: 400 }
    );
  }

  // Validate file type
  if (!ACCEPTED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type", actionable: "Supported formats: JPEG, PNG, GIF, WebP, SVG" },
      { status: 415 }
    );
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large", actionable: "Image must be under 5MB" },
      { status: 413 }
    );
  }

  try {
    // Get repo image settings
    const repoSettings = await prisma.repoSettings.findUnique({
      where: { repoOwner_repoName: { repoOwner: owner, repoName: repo } },
    });

    const imageStorageFolder = repoSettings?.imageStorageFolder ?? "public/images";
    const imageUrlPrefix = repoSettings?.imageUrlPrefix ?? "/images";
    const organizeByFolder = repoSettings?.organizeByFolder ?? false;

    // Generate unique filename
    const filename = slugifyFilename(file.name);

    // Build storage path
    let storagePath: string;
    if (organizeByFolder && contentPath) {
      const subfolder = getSubfolder(contentPath);
      storagePath = subfolder
        ? `${imageStorageFolder}/${subfolder}/${filename}`
        : `${imageStorageFolder}/${filename}`;
    } else {
      storagePath = `${imageStorageFolder}/${filename}`;
    }

    // Read file as base64
    const arrayBuffer = await file.arrayBuffer();
    const base64Content = Buffer.from(arrayBuffer).toString("base64");

    // Commit image to GitHub
    const octokit = await getOctokitForRepo(owner);
    const defaultBranch = repoSettings?.defaultBranch ?? "main";
    const requirePR = repoSettings?.requirePR ?? true;

    let branch = defaultBranch;
    if (requirePR) {
      const draft = await getOrCreateDraftBranch({
        userId: session.user.id,
        owner,
        repo,
        githubLogin: session.user.githubLogin ?? "user",
        filePath: contentPath ?? undefined,
      });
      branch = draft.branch;
    }

    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: storagePath,
      message: `Add image ${filename} via Commit`,
      content: base64Content,
      branch,
    });

    // Build the markdown path by replacing storageFolder prefix with urlPrefix
    // e.g. "public/images/blog/photo-123.jpg" → strip "public/images" → "/blog/photo-123.jpg" → prepend "/images" → "/images/blog/photo-123.jpg"
    const relativePath = storagePath.startsWith(imageStorageFolder)
      ? storagePath.slice(imageStorageFolder.length)
      : `/${storagePath}`;
    const markdownPath = `${imageUrlPrefix}${relativePath}`;

    const githubUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${storagePath}`;
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${storagePath}`;

    return NextResponse.json({ storagePath, markdownPath, githubUrl, rawUrl });
  } catch (error) {
    return githubErrorResponse(error, {
      route: "upload-image",
      owner,
      repo,
      filename: file.name,
    });
  }
}
