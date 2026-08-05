import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { cancelFriendRequest, isValidUuid } from "@/lib/social";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid request ID." }, { status: 400 });
  }

  const result = await cancelFriendRequest({ requestId: id, senderId: user.id });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ success: true });
}
