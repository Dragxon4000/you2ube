import { NextResponse } from "next/server";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { seedProgressionSystem } from "@/db/seed";
import { getCurrentUser } from "@/lib/session";

// GET /api/notifications
export async function GET() {
  await seedProgressionSystem();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const all = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  return NextResponse.json({ notifications: all });
}

// POST /api/notifications - mark one or all as read (scoped to current user)
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

  const id = (body as { id?: unknown }).id;
  const markAll = (body as { markAll?: unknown }).markAll;

  if (markAll === true) {
    await db.update(notifications).set({ read: true }).where(eq(notifications.userId, user.id));
  } else if (typeof id === "number" && Number.isInteger(id) && id > 0) {
    // IDOR-safe: only mark read if the notification belongs to this user.
    const row = await db
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(eq(notifications.id, id))
      .then(r => r[0]);
    if (!row) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }
    if (row.userId !== user.id) {
      return NextResponse.json({ error: "Notification does not belong to you" }, { status: 403 });
    }
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
  } else {
    return NextResponse.json({ error: "Provide id (number) or markAll: true" }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
