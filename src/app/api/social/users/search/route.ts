import { NextResponse } from "next/server";
import { eq, ilike, and, ne } from "drizzle-orm";
import { db } from "@/db";
import { profiles, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth/session";
import { normalizeEmail, isValidEmail } from "@/lib/auth/validation";
import { sql } from "drizzle-orm";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ users: [] });
  }
  if (query.length > 100) {
    return NextResponse.json({ error: "Search query too long." }, { status: 400 });
  }

  // If it looks like an email, search by email (exact), else by display name.
  let where;
  if (isValidEmail(query)) {
    where = and(eq(users.email, normalizeEmail(query)), ne(users.id, user.id));
  } else {
    where = and(
      ilike(profiles.displayName, `%${query.replace(/[%_\\]/g, "")}%`),
      ne(users.id, user.id),
    );
  }

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(where)
    .limit(20);

  return NextResponse.json({ users: rows });
}
