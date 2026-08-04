import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getUserTotalXp, calculateLevel, getRecentXpHistory } from "@/lib/xp";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const totalXp = await getUserTotalXp(user.id);
  const levelInfo = calculateLevel(totalXp);
  const recentHistory = await getRecentXpHistory(user.id, 20);

  return NextResponse.json({
    totalXp,
    ...levelInfo,
    history: recentHistory,
  });
}
