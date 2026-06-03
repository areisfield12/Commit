import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { RepoSettingsClient } from "./RepoSettingsClient";

interface RepoSettingsPageProps {
  params: Promise<{ owner: string; repo: string }>;
}

export default async function RepoSettingsPage({ params }: RepoSettingsPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  const { owner, repo } = await params;

  const settings = await prisma.repoSettings.findUnique({
    where: { repoOwner_repoName: { repoOwner: owner, repoName: repo } },
  });

  return (
    <AppShell repoOwner={owner} repoName={repo}>
      <RepoSettingsClient
        owner={owner}
        repo={repo}
        initialSettings={{
          defaultBranch: settings?.defaultBranch ?? "main",
          requirePR: settings?.requirePR ?? true,
          protectedBranches: settings?.protectedBranches ?? [],
          imageStorageFolder: settings?.imageStorageFolder ?? "public/images",
          imageUrlPrefix: settings?.imageUrlPrefix ?? "/images",
          organizeByFolder: settings?.organizeByFolder ?? false,
          frontmatterPicklists:
            (settings?.frontmatterPicklists as Record<string, string[]> | null) ??
            {},
        }}
      />
    </AppShell>
  );
}
