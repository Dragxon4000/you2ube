import { NextResponse } from "next/server";
import { db } from "@/db";
import { searchHistory } from "@/db/schema";
import { getSessionUser } from "@/lib/auth/session";
import { awardXp, XP_REWARDS } from "@/lib/xp";
import {
  isYouTubeApiError,
  searchYouTube,
} from "@/lib/youtube";
import {
  checkYouTubeSearchRateLimit,
  getRequestRateLimitKey,
} from "@/lib/youtube-rate-limit";

const PAGE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,300}$/;

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
  if (pageToken && !PAGE_TOKEN_PATTERN.test(pageToken)) {
    return NextResponse.json({ error: "Invalid search page token." }, { status: 400 });
  }

  const user = await getSessionUser().catch(() => null);
  const rateLimit = checkYouTubeSearchRateLimit(getRequestRateLimitKey(request, user?.id));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Please wait ${rateLimit.retryAfterSeconds} seconds before searching again.`,
        code: "local_rate_limited",
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  try {
    const result = await searchYouTube(query, 12, pageToken);

    if (user) {
      try {
        await db.insert(searchHistory).values({
          userId: user.id,
          query,
          resultCount: result.totalResults,
        });
        await awardXp(user.id, XP_REWARDS.search, "search");
      } catch (error) {
        // Search should still work even if social telemetry cannot be saved.
        console.error("[youtube] Failed to log search history:", error);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    if (isYouTubeApiError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }

    console.error("[youtube] Unexpected search error:", error);
    return NextResponse.json(
      { error: "YouTube search is temporarily unavailable." },
      { status: 502 },
    );
  }
}
