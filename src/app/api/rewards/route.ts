import { NextResponse } from "next/server";
import { db } from "@/db";
import { rewards, userRewards } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { seedProgressionSystem } from "@/db/seed";
import { getCurrentUser } from "@/lib/session";

// GET /api/rewards
export async function GET() {
  await seedProgressionSystem();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const all = await db.select().from(rewards).orderBy(asc(rewards.levelRequired));
  const mine = await db.select().from(userRewards).where(eq(userRewards.userId, user.id));
  const claimedIds = new Set(mine.map(m => m.rewardId));

  const merged = all.map(r => {
    const unlocked = user.level >= r.levelRequired;
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      icon: r.icon,
      levelRequired: r.levelRequired,
      type: r.type,
      value: r.value,
      unlocked,
      claimed: claimedIds.has(r.id),
    };
  });

  return NextResponse.json({ rewards: merged, userLevel: user.level });
}
