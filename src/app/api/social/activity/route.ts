import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActivityHistoryForUser } from "@/lib/social";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const rawLimit = new URL(request.url).searchParams.get("limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return NextResponse.json({ error: "Limit must be between 1 and 100." }, { status: 400 });
  }

  return NextResponse.json({ history: await getActivityHistoryForUser(user.id, limit) });
}
