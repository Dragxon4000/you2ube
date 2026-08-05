import { NextResponse } from "next/server";
import { getVideoDetails, isYouTubeApiError } from "@/lib/youtube";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const video = await getVideoDetails(id);
    if (!video) {
      return NextResponse.json({ error: "YouTube video not found." }, { status: 404 });
    }
    return NextResponse.json({ video });
  } catch (error) {
    if (isYouTubeApiError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }

    console.error("[youtube] Unexpected video lookup error:", error);
    return NextResponse.json(
      { error: "YouTube metadata is temporarily unavailable." },
      { status: 502 },
    );
  }
}
