import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const SettingsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  defaultBranch: z.string().default("main"),
  requirePR: z.boolean().default(false),
  protectedBranches: z.array(z.string()).default([]),
  imageStorageFolder: z.string().default("public/images"),
  imageUrlPrefix: z.string().default("/images"),
  organizeByFolder: z.boolean().default(false),
  frontmatterPicklists: z
    .record(z.string().min(1), z.array(z.string().min(1)))
    .default({}),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized", actionable: "Sign in to continue." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request", actionable: "Please try again." }, { status: 400 });
  }

  const parsed = SettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settings", actionable: "Check your input and try again." }, { status: 400 });
  }

  const { owner, repo, defaultBranch, requirePR, protectedBranches, imageStorageFolder, imageUrlPrefix, organizeByFolder, frontmatterPicklists } = parsed.data;

  // Strip leading slash from storage folder if present
  const sanitizedStorageFolder = imageStorageFolder.replace(/^\/+/, "");

  // Drop picklists with empty option arrays so they don't clutter the DB
  const sanitizedPicklists: Record<string, string[]> = {};
  for (const [key, options] of Object.entries(frontmatterPicklists)) {
    const trimmedKey = key.trim();
    if (!trimmedKey) continue;
    const dedupedOptions = Array.from(
      new Set(options.map((o) => o.trim()).filter(Boolean))
    );
    if (dedupedOptions.length > 0) {
      sanitizedPicklists[trimmedKey] = dedupedOptions;
    }
  }

  const settings = await prisma.repoSettings.upsert({
    where: { repoOwner_repoName: { repoOwner: owner, repoName: repo } },
    create: {
      repoOwner: owner,
      repoName: repo,
      defaultBranch,
      requirePR,
      protectedBranches,
      imageStorageFolder: sanitizedStorageFolder,
      imageUrlPrefix,
      organizeByFolder,
      frontmatterPicklists: sanitizedPicklists,
    },
    update: {
      defaultBranch,
      requirePR,
      protectedBranches,
      imageStorageFolder: sanitizedStorageFolder,
      imageUrlPrefix,
      organizeByFolder,
      frontmatterPicklists: sanitizedPicklists,
    },
  });

  return NextResponse.json({ settings });
}
