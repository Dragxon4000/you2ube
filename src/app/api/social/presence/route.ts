import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getOnlineUsers, heartbeatPresence, setUserPresence } from "@/lib/social";
import { isValidYouTubeVideoId } from "@/lib/youtube";

const statuses = ["online", "away", "offline"] as const;
type PresenceStatus = (typeof statuses)[number];

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  return NextResponse.json({ online: await getOnlineUsers(5) });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const input = (body ?? {}) as {
    status?: PresenceStatus;
    currentVideoId?: string | null;
    currentVideoTitle?: string | null;
    customStatus?: string | null;
  };
  const status = input.status ?? "online";
  if (!statuses.includes(status)) {
    return NextResponse.json({ error: "Invalid presence status." }, { status: 400 });
  }
  if (input.currentVideoId && !isValidYouTubeVideoId(input.currentVideoId)) {
    return NextResponse.json({ error: "Invalid currentVideoId." }, { status: 400 });
  }
  if (input.currentVideoTitle !== undefined && input.currentVideoTitle !== null && typeof input.currentVideoTitle !== "string") {
    return NextResponse.json({ error: "Invalid currentVideoTitle." }, { status: 400 });
  }
  if (input.customStatus !== undefined && input.customStatus !== null && typeof input.customStatus !== "string") {
    return NextResponse.json({ error: "Invalid customStatus." }, { status: 400 });
  }

  await setUserPresence({
    userId: user.id,
    status,
    currentVideoId: input.currentVideoId ?? null,
    currentVideoTitle: input.currentVideoTitle ?? null,
    customStatus: input.customStatus ?? null,
  });
  return NextResponse.json({ success: true });
}

export async function PATCH() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  await heartbeatPresence(user.id);
  return NextResponse.json({ success: true });
}
