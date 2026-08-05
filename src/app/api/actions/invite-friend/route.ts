import { NextResponse } from "next/server";
import { db } from "@/db";
import { friendInvites } from "@/db/schema";
import { eq } from "drizzle-orm";
import { awardXp } from "@/lib/progression";
import { seedProgressionSystem } from "@/db/seed";
import { getCurrentUser } from "@/lib/session";

// Username must be alphanumeric, underscores, hyphens — 2-30 chars.
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{2,30}$/;

// POST /api/actions/invite-friend
export async function POST(req: Request) {
  await seedProgressionSystem();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = (body as { inviteeUsername?: unknown }).inviteeUsername;
  if (typeof raw !== "string" || !USERNAME_REGEX.test(raw.trim())) {
    return NextResponse.json(
      { error: "inviteeUsername must be 2-30 chars, alphanumeric with _ or -" },
      { status: 400 },
    );
  }
  const inviteeUsername = raw.trim();

  // Prevent inviting yourself
  if (inviteeUsername.toLowerCase() === user.username.toLowerCase()) {
    return NextResponse.json({ error: "You can't invite yourself" }, { status: 400 });
  }

  const [invite] = await db.insert(friendInvites).values({
    inviterId: user.id,
    inviteeUsername,
    xpEarned: 0,
    accepted: true, // simulate acceptance for demo
  }).returning();

  const result = await awardXp({
    userId: user.id,
    action: "invite_friend",
    referenceType: "friend_invite",
    referenceId: invite.id,
    contextMessage: `Invited ${inviteeUsername} to you2ube — they accepted!`,
  });

  await db.update(friendInvites).set({ xpEarned: result.xpGained }).where(eq(friendInvites.id, invite.id));

  return NextResponse.json({
    success: true,
    invite: { id: invite.id, inviteeUsername: invite.inviteeUsername },
    result,
  });
}
