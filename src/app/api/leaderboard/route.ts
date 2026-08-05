import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, levels } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { seedProgressionSystem } from "@/db/seed";
import { getCurrentUser } from "@/lib/session";

// GET /api/leaderboard
export async function GET() {
  await seedProgressionSystem();
  const top = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarEmoji: users.avatarEmoji,
      xp: users.xp,
      level: users.level,
    })
    .from(users)
    .orderBy(desc(users.xp))
    .limit(20);

  const levelRows = await db.select().from(levels);
  const levelByNumber = new Map(levelRows.map(l => [l.level, l]));

  const enriched = top.map((u, idx) => ({
    rank: idx + 1,
    ...u,
    levelTitle: levelByNumber.get(u.level)?.title ?? "—",
    levelColor: levelByNumber.get(u.level)?.colorHex ?? "#64748b",
  }));

  const you = await getCurrentUser();
  let yourRank: number | null = null;
  if (you) {
    const row = await db
      .select({ count: sql<number>`(select count(*) + 1 from users where xp > ${you.xp})::int` })
      .from(users)
      .where(eq(users.id, you.id))
      .then(r => r[0]);
    yourRank = row?.count ?? null;
  }

  return NextResponse.json({ leaderboard: enriched, yourRank, yourUserId: you?.id ?? null });
}
