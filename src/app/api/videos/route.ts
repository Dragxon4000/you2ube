import { NextResponse } from "next/server";
import { db } from "@/db";
import { videos } from "@/db/schema";
import { seedProgressionSystem } from "@/db/seed";

// GET /api/videos - demo content feed
export async function GET() {
  await seedProgressionSystem();
  const all = await db.select().from(videos).orderBy(videos.id);
  return NextResponse.json({ videos: all });
}
