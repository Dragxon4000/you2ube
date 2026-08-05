import { NextResponse } from "next/server";
import { claimReward } from "@/lib/progression";
import { seedProgressionSystem } from "@/db/seed";
import { getCurrentUser } from "@/lib/session";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await seedProgressionSystem();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const rewardId = parseInt(id, 10);
  if (Number.isNaN(rewardId) || rewardId < 1 || rewardId > 1_000_000) {
    return NextResponse.json({ error: "Invalid reward id" }, { status: 400 });
  }

  try {
    const result = await claimReward(user.id, rewardId);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
