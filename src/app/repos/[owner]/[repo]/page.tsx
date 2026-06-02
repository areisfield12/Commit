import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { RepoBrowserClient } from "./RepoBrowserClient";

interface RepoPageProps {
  params: Promise<{ owner: string; repo: string }>;
}

export default async function RepoPage({ params }: RepoPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  const { owner, repo } = await params;

  // Load starred files for this repo
  const starredFiles = await prisma.starredFile.findMany({
    where: {
      userId: session.user.id,
      repoOwner: owner,
      repoName: repo,
    },
  });

  // Load repo settings
  const repoSettings = await prisma.repoSettings.findUnique({
    where: { repoOwner_repoName: { repoOwner: owner, repoName: repo } },
  });

  return (
    <AppShell repoOwner={owner} repoName={repo}>
      <Suspense fallback={null}>
        <RepoBrowserClient
          owner={owner}
          repo={repo}
          userId={session.user.id}
          initialStarredPaths={starredFiles.map((s) => s.filePath)}
          requirePR={repoSettings?.requirePR ?? true}
        />
      </Suspense>
    </AppShell>
  );
}
