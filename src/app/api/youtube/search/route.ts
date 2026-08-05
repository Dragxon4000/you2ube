import { NextResponse } from "next/server";
import { searchYouTube } from "@/lib/youtube";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/db";
import { searchHistory } from "@/db/schema";
import { awardXp, XP_REWARDS } from "@/lib/xp";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const pageToken = searchParams.get("pageToken") ?? undefined;

  if (!query) {
    return NextResponse.json({ error: "Missing search query." }, { status: 400 });
  }

  if (query.length > 200) {
    return NextResponse.json({ error: "Search query is too long." }, { status: 400 });
  }

  const result = await searchYouTube(query, 12, pageToken);

  // If user is authenticated, log search and award XP
  const user = await getSessionUser().catch(() => null);
  if (user) {
    try {
      await db.insert(searchHistory).values({
        userId: user.id,
        query,
        resultCount: result.totalResults,
      });
      await awardXp(user.id, XP_REWARDS.search, "search");
    } catch (err) {
      console.error("[search] Failed to log search history:", err);
    }
  }

  return NextResponse.json(result);
}
