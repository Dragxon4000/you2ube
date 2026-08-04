import { NextResponse } from "next/server";
import { getTrendingVideos } from "@/lib/youtube";

export async function GET() {
  const videos = await getTrendingVideos(12);
  return NextResponse.json({ videos });
}
