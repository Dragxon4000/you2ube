import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActivityFeedForUser } from "@/lib/social";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 30, 1), 100) : 30;

  const feed = await getActivityFeedForUser(user.id, limit);
  return NextResponse.json({ feed });
}
