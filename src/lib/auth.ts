import { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_APP_CLIENT_ID!,
      clientSecret: process.env.GITHUB_APP_CLIENT_SECRET!,
      authorization: {
        params: {
          // Read user identity; write scopes come from GitHub App installation
          scope: "read:user user:email",
        },
      },
      profile(profile) {
        return {
          id: String(profile.id),
          name: profile.name ?? profile.login,
          email: profile.email,
          image: profile.avatar_url,
          githubId: profile.id,
          githubLogin: profile.login,
          avatarUrl: profile.avatar_url,
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user, account }) => {
      if (user) {
        token.id = user.id;
        token.githubLogin = (user as any).githubLogin ?? null;
        token.githubId = (user as any).githubId ?? null;
        token.avatarUrl = (user as any).avatarUrl ?? null;
      } else if (token.id) {
        const dbUser = await prisma.user.findUnique({ where: { id: token.id as string } });
        if (!dbUser) {
          return { ...token, id: null };
        }
      }

      // PrismaAdapter only writes Account tokens on the very first sign-in. On every
      // subsequent sign-in NextAuth still hands us a fresh `account` object — write
      // those tokens to the Account row so refresh_token / access_token stay current.
      if (account?.provider === "github" && account.providerAccountId) {
        const refreshExpiresRaw = (account as unknown as Record<string, unknown>).refresh_token_expires_in;
        const refreshTokenExpiresIn =
          typeof refreshExpiresRaw === "number" ? refreshExpiresRaw : null;

        try {
          await prisma.account.update({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
            data: {
              access_token: account.access_token ?? null,
              refresh_token: account.refresh_token ?? null,
              expires_at: typeof account.expires_at === "number" ? account.expires_at : null,
              refresh_token_expires_in: refreshTokenExpiresIn,
              token_type: account.token_type ?? null,
              scope: account.scope ?? null,
            },
          });
        } catch (err) {
          console.error("[auth.jwt] failed to update Account tokens:", err);
        }
      }

      return token;
    },
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.id as string,
        githubLogin: token.githubLogin as string | null,
        githubId: token.githubId as number | null,
        avatarUrl: token.avatarUrl as string | null,
      },
    }),
  },
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "jwt",
  },
};
