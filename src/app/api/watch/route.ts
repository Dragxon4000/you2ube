import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { isValidYouTubeVideoId } from "@/lib/youtube";
import {
  getRecentWatchSessions,
  MAX_TRACKED_PLAYBACK_SECONDS,
  saveWatchProgress,
} from "@/lib/watch-sessions";

function optionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

function asTrackedSeconds(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(Math.max(Math.floor(value), 0), MAX_TRACKED_PLAYBACK_SECONDS);
}

/**
 * POST /api/watch
 * Persists an authenticated user's actual YouTube IFrame Player position.
 * This endpoint receives metadata and timing only; it never receives,
 * downloads, transforms, or proxies video bytes.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const videoId = optionalText(input.videoId, 32);
  const videoTitle = optionalText(input.videoTitle, 500);
  const channelName = optionalText(input.channelName, 250);
  const thumbnailUrl = optionalText(input.thumbnailUrl, 1_000);
  const durationSeconds = asTrackedSeconds(input.durationSeconds);
  const positionSeconds = asTrackedSeconds(input.positionSeconds);
  const completed = input.completed === true;

  if (!videoId || !isValidYouTubeVideoId(videoId)) {
    return NextResponse.json({ error: "Invalid YouTube video ID." }, { status: 400 });
  }
  if (!videoTitle) {
    return NextResponse.json({ error: "Missing video title." }, { status: 400 });
  }
  if (positionSeconds === null) {
    return NextResponse.json({ error: "Playback position is required." }, { status: 400 });
  }
  if (input.durationSeconds !== null && input.durationSeconds !== undefined && durationSeconds === null) {
    return NextResponse.json({ error: "Invalid video duration." }, { status: 400 });
  }
  if (thumbnailUrl) {
    try {
      const url = new URL(thumbnailUrl);
      if (url.protocol !== "https:") throw new Error("Avatar URL must use HTTPS.");
    } catch {
      return NextResponse.json({ error: "Invalid thumbnail URL." }, { status: 400 });
    }
  }

  try {
    const result = await saveWatchProgress({
      userId: user.id,
      videoId,
      videoTitle,
      channelName,
      thumbnailUrl,
      durationSeconds,
      positionSeconds,
      completed,
    });

    return NextResponse.json({
      sessionId: result.session.id,
      created: result.created,
      completedNow: result.completedNow,
      resumePositionSeconds: result.session.resumePositionSeconds,
    });
  } catch (error) {
    console.error("[watch] Unable to save playback progress:", error);
    return NextResponse.json({ error: "Unable to save playback progress." }, { status: 500 });
  }
}

/** GET /api/watch — returns the current user's latest resumable watch sessions. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const rawLimit = new URL(request.url).searchParams.get("limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return NextResponse.json({ error: "Limit must be an integer between 1 and 50." }, { status: 400 });
  }

  const history = await getRecentWatchSessions(user.id, limit);
  return NextResponse.json({ history });
}
