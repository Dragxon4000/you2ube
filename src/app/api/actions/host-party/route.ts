import { NextResponse } from "next/server";
import { db } from "@/db";
import { watchParties } from "@/db/schema";
import { eq } from "drizzle-orm";
import { awardXp } from "@/lib/progression";
import { seedProgressionSystem } from "@/db/seed";
import { getCurrentUser } from "@/lib/session";

const MAX_TITLE_LENGTH = 100;
const MAX_ATTENDEES = 50;

// POST /api/actions/host-party
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

  const title = (body as { title?: unknown }).title;
  const attendeeCount = (body as { attendeeCount?: unknown }).attendeeCount;

  if (typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json({ error: "title must be a non-empty string" }, { status: 400 });
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return NextResponse.json({ error: `title must be ${MAX_TITLE_LENGTH} chars or less` }, { status: 400 });
  }
  if (attendeeCount !== undefined && (typeof attendeeCount !== "number" || !Number.isInteger(attendeeCount))) {
    return NextResponse.json({ error: "attendeeCount must be an integer" }, { status: 400 });
  }

  const attendees = Math.max(0, Math.min(MAX_ATTENDEES, typeof attendeeCount === "number" ? attendeeCount : 3));
  const cleanTitle = title.trim().slice(0, MAX_TITLE_LENGTH);
  const bonusFlat = attendees * 10;

  const [party] = await db.insert(watchParties).values({
    hostId: user.id,
    title: cleanTitle,
    attendeeCount: attendees,
    xpEarned: 0,
  }).returning();

  const result = await awardXp({
    userId: user.id,
    action: "host_party",
    bonusFlat,
    referenceType: "watch_party",
    referenceId: party.id,
    contextMessage: `Hosted watch party "${cleanTitle}" with ${attendees} attendee${attendees === 1 ? "" : "s"}`,
  });

  await db.update(watchParties).set({ xpEarned: result.xpGained }).where(eq(watchParties.id, party.id));

  return NextResponse.json({
    success: true,
    party: { id: party.id, title: party.title, attendeeCount: attendees },
    result,
  });
}
