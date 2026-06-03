import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { DefaultRepoSetting } from "@/components/settings/DefaultRepoSetting";
import { prisma } from "@/lib/prisma";
import Image from "next/image";
import { Github } from "lucide-react";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { defaultRepo: true, defaultFolder: true },
  });

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <h1 className="text-lg font-semibold text-fg mb-6 tracking-[-0.01em]">Settings</h1>

          <DefaultRepoSetting
            initialDefaultRepo={user?.defaultRepo ?? null}
            initialDefaultFolder={user?.defaultFolder ?? null}
          />

          <section className="bg-surface border border-border rounded-lg p-6 mb-4">
            <h2 className="text-[14px] font-semibold text-fg mb-4">Profile</h2>
            <div className="flex items-center gap-4">
              {session.user.image ? (
                <Image
                  src={session.user.image}
                  alt={session.user.name ?? "User"}
                  width={56}
                  height={56}
                  className="rounded-full"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-fg flex items-center justify-center text-fg-inverted text-xl font-bold">
                  {session.user.name?.[0] ?? "U"}
                </div>
              )}
              <div>
                <p className="font-semibold text-fg">{session.user.name}</p>
                <p className="text-sm text-fg-tertiary">{session.user.email}</p>
                {session.user.githubLogin && (
                  <a
                    href={`https://github.com/${session.user.githubLogin}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-fg-tertiary hover:text-fg-secondary transition-colors mt-1"
                  >
                    <Github className="h-3.5 w-3.5" />
                    @{session.user.githubLogin}
                  </a>
                )}
              </div>
            </div>
          </section>

          <section className="bg-surface border border-border rounded-lg p-6 mb-4">
            <h2 className="text-base font-semibold text-fg mb-2">
              GitHub App Installation
            </h2>
            <p className="text-sm text-fg-tertiary mb-4">
              Commit needs to be installed on your repositories or organization to
              read and write files. Install the GitHub App to get started.
            </p>
            <a
              href={`https://github.com/apps/commit-editor/installations/new`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-fg text-fg-inverted rounded-md text-[13px] font-medium hover:bg-fg/90 transition-colors"
            >
              <Github className="h-4 w-4" />
              Manage GitHub App installations
            </a>
          </section>

          <section className="bg-surface border border-border rounded-lg p-6 mb-4">
            <h2 className="text-base font-semibold text-fg mb-2">Repository settings</h2>
            <p className="text-sm text-fg-tertiary">
              Each repository has its own settings — default branch, pull request requirements, and image storage.
              Access them by hovering a repo in the sidebar and clicking the gear icon that appears.
            </p>
          </section>

          <section className="bg-surface border border-border rounded-lg p-6">
            <h2 className="text-base font-semibold text-fg mb-2">About Commit</h2>
            <p className="text-sm text-fg-tertiary">
              Commit is a Google Docs-style markdown editor for GitHub-native teams.
              Files always live in your GitHub repositories — Commit is a lens, not a
              storage layer.
            </p>
            <div className="mt-4 pt-4 border-t border-border-secondary text-xs text-fg-tertiary space-y-1">
              <p>Version: 1.0.0-beta</p>
              <p>All data stored in your connected GitHub organization.</p>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
