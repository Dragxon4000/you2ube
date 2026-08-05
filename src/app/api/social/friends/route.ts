import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  getFriendsForUser,
  getFriendRequestsForUser,
  removeFriend,
} from "@/lib/social";
import { isValidUuid } from "@/lib/social";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [friends, requests] = await Promise.all([
    getFriendsForUser(user.id),
    getFriendRequestsForUser(user.id),
  ]);

  return NextResponse.json({ friends, incoming: requests.incoming, outgoing: requests.outgoing });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const friendId = searchParams.get("friendId");
  if (!friendId || !isValidUuid(friendId)) {
    return NextResponse.json({ error: "Invalid friendId." }, { status: 400 });
  }

  const result = await removeFriend({ userId: user.id, friendId });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
