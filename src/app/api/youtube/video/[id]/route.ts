import { NextResponse } from "next/server";
import { getVideoDetails } from "@/lib/youtube";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id || id.length > 20) {
    return NextResponse.json({ error: "Invalid video ID." }, { status: 400 });
  }

  const video = await getVideoDetails(id);
  if (!video) {
    return NextResponse.json({ error: "Video not found or API unavailable." }, { status: 404 });
  }

  return NextResponse.json({ video });
}
