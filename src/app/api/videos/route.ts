import { NextResponse } from "next/server";
import { db } from "@/db";
import { videos } from "@/db/schema";
import { apiError, ErrorCode, log, withAuth } from "@/lib/api-helpers";

// GET /api/videos - demo content feed
export async function GET() {
  return withAuth(async () => {
    try {
      const all = await db.select().from(videos).orderBy(videos.id);
      return NextResponse.json({ videos: all });
    } catch (err) {
      log("error", "videos GET failed", { error: (err as Error).message });
      return apiError(500, ErrorCode.INTERNAL, "Failed to load videos");
    }
  });
}
