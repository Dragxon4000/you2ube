import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { sendFriendRequest } from "@/lib/social";
import { isValidUuid } from "@/lib/social";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { receiverId, toUserId, message } = (body ?? {}) as {
    receiverId?: string;
    toUserId?: string;
    message?: string;
  };
  const targetUserId = receiverId ?? toUserId;
  if (!targetUserId || !isValidUuid(targetUserId)) {
    return NextResponse.json({ error: "Invalid receiverId." }, { status: 400 });
  }
  if (typeof message !== "undefined" && (typeof message !== "string" || message.length > 200)) {
    return NextResponse.json({ error: "Message must be 200 characters or fewer." }, { status: 400 });
  }

  const result = await sendFriendRequest({
    senderId: user.id,
    receiverId: targetUserId,
    message,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true, requestId: "requestId" in result ? result.requestId : null });
}
