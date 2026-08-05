import { NextResponse } from "next/server";
import { db } from "@/db";
import { badges, userBadges } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withAuth, apiError, ErrorCode, log } from "@/lib/api-helpers";

// GET /api/badges
export async function GET() {
  return withAuth(async ({ user }) => {
    try {
      const all = await db.select().from(badges);
      const mine = await db.select().from(userBadges).where(eq(userBadges.userId, user.id));
      const mineById = new Map(mine.map(m => [m.badgeId, m]));

      const merged = all.map(b => ({
        id: b.id,
        code: b.code,
        name: b.name,
        description: b.description,
        icon: b.icon,
        tier: b.tier,
        requirementText: b.requirementText,
        owned: mineById.has(b.id),
        awardedAt: mineById.get(b.id)?.awardedAt ?? null,
      }));

      return NextResponse.json({ badges: merged });
    } catch (err) {
      log("error", "badges GET failed", { userId: user.id, error: (err as Error).message });
      return apiError(500, ErrorCode.INTERNAL, "Failed to load badges");
    }
  });
}
