import { prisma } from "./prisma";

type RefreshedTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  refresh_token_expires_in: number | null;
};

/**
 * Return a valid GitHub user-to-server access token for the given user, refreshing
 * it via the stored refresh_token if it's expired. Returns null if the user has no
 * stored credentials, or if the refresh attempt fails (e.g. refresh token expired
 * after 6 months) — in which case the caller should prompt the user to sign in again.
 *
 * GitHub App user tokens expire after 8 hours; refresh tokens last ~6 months.
 */
export async function getValidGitHubUserToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
    select: {
      provider: true,
      providerAccountId: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
    },
  });

  if (!account?.access_token) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAt = account.expires_at ?? 0;

  // Still valid with a 60-second safety buffer.
  if (expiresAt > nowSec + 60) {
    return account.access_token;
  }

  if (!account.refresh_token) return null;

  const refreshed = await refreshGitHubToken(account.refresh_token);
  if (!refreshed) return null;

  await prisma.account.update({
    where: {
      provider_providerAccountId: {
        provider: account.provider,
        providerAccountId: account.providerAccountId,
      },
    },
    data: {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: refreshed.expires_at,
      refresh_token_expires_in: refreshed.refresh_token_expires_in,
    },
  });

  return refreshed.access_token;
}

async function refreshGitHubToken(refreshToken: string): Promise<RefreshedTokens | null> {
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: string | number;
    refresh_token_expires_in?: string | number;
    error?: string;
  };

  if (data.error || !data.access_token || !data.refresh_token || !data.expires_in) {
    return null;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expiresIn = typeof data.expires_in === "string" ? parseInt(data.expires_in, 10) : data.expires_in;
  const refreshExpiresIn = data.refresh_token_expires_in
    ? typeof data.refresh_token_expires_in === "string"
      ? parseInt(data.refresh_token_expires_in, 10)
      : data.refresh_token_expires_in
    : null;

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: nowSec + expiresIn,
    refresh_token_expires_in: refreshExpiresIn,
  };
}
