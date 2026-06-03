import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EditorPageClient } from "./EditorPageClient";

interface EditorPageProps {
  params: Promise<{
    owner: string;
    repo: string;
    path: string[];
  }>;
}

export default async function EditorPage({ params }: EditorPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  const { owner, repo, path } = await params;
  const filePath = path.join("/");

  // Load repo settings to know if PR mode is required
  const repoSettings = await prisma.repoSettings.findUnique({
    where: { repoOwner_repoName: { repoOwner: owner, repoName: repo } },
  });

  return (
    <EditorPageClient
      owner={owner}
      repo={repo}
      filePath={filePath}
      userId={session.user.id}
      requirePR={repoSettings?.requirePR ?? true}
      defaultBranch={repoSettings?.defaultBranch ?? "main"}
      imageStorageFolder={repoSettings?.imageStorageFolder ?? "public/images"}
      imageUrlPrefix={repoSettings?.imageUrlPrefix ?? "/images"}
      frontmatterPicklists={
        (repoSettings?.frontmatterPicklists as Record<string, string[]> | null) ??
        {}
      }
    />
  );
}
