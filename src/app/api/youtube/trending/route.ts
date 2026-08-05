import { NextResponse } from "next/server";
import { getTrendingVideos, isYouTubeApiError } from "@/lib/youtube";

export async function GET() {
  try {
    const videos = await getTrendingVideos(12);
    return NextResponse.json({ videos });
  } catch (error) {
    if (isYouTubeApiError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }

    console.error("[youtube] Unexpected trending lookup error:", error);
    return NextResponse.json(
      { error: "Trending videos are temporarily unavailable." },
      { status: 502 },
    );
  }
}
