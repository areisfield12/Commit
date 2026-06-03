import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized", actionable: "Sign in to continue." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { defaultRepo: true, defaultFolder: true },
  });

  return NextResponse.json({
    defaultRepo: user?.defaultRepo ?? null,
    defaultFolder: user?.defaultFolder ?? null,
  });
}

const UserSettingsSchema = z.object({
  defaultRepo: z.string().nullable(),
  defaultFolder: z.string().nullable().optional(),
});

export async function PATCH(request: NextRequest) {
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

  const parsed = UserSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settings", actionable: "Check your input and try again." }, { status: 400 });
  }

  const nextDefaultRepo = parsed.data.defaultRepo;
  const nextDefaultFolder = nextDefaultRepo === null ? null : (parsed.data.defaultFolder ?? null);

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      defaultRepo: nextDefaultRepo,
      defaultFolder: nextDefaultFolder,
    },
    select: { defaultRepo: true, defaultFolder: true },
  });

  return NextResponse.json({
    defaultRepo: user.defaultRepo,
    defaultFolder: user.defaultFolder,
  });
}
