import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { isValidUuid, removeFriend } from "@/lib/social";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { friendId } = (body ?? {}) as { friendId?: string };
  if (!friendId || !isValidUuid(friendId)) {
    return NextResponse.json({ error: "Invalid friendId." }, { status: 400 });
  }

  const result = await removeFriend({ userId: user.id, friendId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true });
}
