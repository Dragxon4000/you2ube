import Link from "next/link";
import { eq, desc, count } from "drizzle-orm";
import { db } from "@/db";
import { profiles, users, watchSessions } from "@/db/schema";
import { getSessionUser } from "@/lib/auth/session";
import { calculateLevel, getUserTotalXp } from "@/lib/xp";
import { WatchHistory } from "@/components/watch-history";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await getSessionUser();
  const isOwner = viewer?.id === id;

  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      createdAt: users.createdAt,
      profileId: profiles.id,
      displayName: profiles.displayName,
      bio: profiles.bio,
      location: profiles.location,
      websiteUrl: profiles.websiteUrl,
      avatarUrl: profiles.avatarUrl,
      profileVisibility: profiles.profileVisibility,
      showWatchHistory: profiles.showWatchHistory,
      showXp: profiles.showXp,
      showAchievements: profiles.showAchievements,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, id))
    .limit(1);

  const profile = rows[0];

  if (!profile) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-6 py-12">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Profile not found</h1>
          <Link href="/dashboard" className="mt-4 inline-block text-sm font-semibold text-red-400 hover:underline">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const visibility = profile.profileVisibility ?? "public";
  const canViewProfile = isOwner || visibility === "public";
  const canViewPrivateSocial = isOwner || visibility === "public";

  if (!canViewProfile) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-6 py-12">
        <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-slate-800 text-3xl">🔒</div>
          <h1 className="mt-4 text-2xl font-bold text-white">This profile is private</h1>
          <p className="mt-2 text-sm text-slate-400">
            The owner has limited who can view their you2ube profile.
          </p>
          <Link href="/dashboard" className="mt-5 inline-block text-sm font-semibold text-red-400 hover:underline">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const [totalXp, recentWatches, watchCount] = await Promise.all([
    profile.showXp || isOwner ? getUserTotalXp(profile.userId) : Promise.resolve(0),
    profile.showWatchHistory && canViewPrivateSocial
      ? db
          .select()
          .from(watchSessions)
          .where(eq(watchSessions.userId, profile.userId))
          .orderBy(desc(watchSessions.lastWatchedAt))
          .limit(6)
      : Promise.resolve([]),
    db
      .select({ value: count() })
      .from(watchSessions)
      .where(eq(watchSessions.userId, profile.userId)),
  ]);

  const levelInfo = calculateLevel(totalXp);

  return (
    <main className="min-h-screen bg-slate-950">
      <nav className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <Link href={viewer ? "/dashboard" : "/"} className="flex items-center gap-1.5">
          <svg className="h-7 w-7 text-red-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
            <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="white" />
          </svg>
          <span className="text-lg font-bold text-white">you2ube</span>
        </Link>
        <div className="flex items-center gap-4">
          {isOwner && (
            <Link href="/profile" className="text-sm font-medium text-red-400 hover:underline">
              Edit profile
            </Link>
          )}
          <Link href={viewer ? "/dashboard" : "/login"} className="text-sm font-medium text-slate-400 hover:text-white">
            {viewer ? "Dashboard" : "Log in"}
          </Link>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="grid h-28 w-28 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-700 bg-slate-800 text-4xl font-bold text-slate-500">
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatarUrl} alt="Profile avatar" className="h-full w-full object-cover" />
              ) : (
                (profile.displayName ?? profile.email).slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold text-white">{profile.displayName ?? profile.email}</h1>
                <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-400">
                  {visibility}
                </span>
              </div>
              {profile.bio && <p className="mt-3 max-w-2xl text-slate-300">{profile.bio}</p>}
              <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-500">
                {profile.location && <span>📍 {profile.location}</span>}
                <span>Joined {profile.createdAt.toLocaleDateString()}</span>
                {profile.websiteUrl && (
                  <a href={profile.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-red-400 hover:underline">
                    Website
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {(profile.showXp || isOwner) && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-xs uppercase tracking-wide text-slate-500">Level</p>
              <p className="mt-1 text-3xl font-bold text-white">{levelInfo.level}</p>
              <p className="mt-2 text-xs text-yellow-400">{totalXp.toLocaleString()} XP</p>
            </div>
          )}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Videos watched</p>
            <p className="mt-1 text-3xl font-bold text-white">{watchCount[0]?.value ?? 0}</p>
            <p className="mt-2 text-xs text-slate-500">Lifetime sessions</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Achievements</p>
            <p className="mt-1 text-3xl font-bold text-white">—</p>
            <p className="mt-2 text-xs text-slate-500">
              {profile.showAchievements || isOwner ? "Coming soon" : "Hidden"}
            </p>
          </div>
        </div>

        <section className="mt-8">
          <h2 className="mb-4 text-lg font-semibold text-white">Recent watch history</h2>
          {profile.showWatchHistory && canViewPrivateSocial ? (
            recentWatches.length > 0 ? (
              <WatchHistory
                sessions={recentWatches.map((session) => ({
                  id: session.id,
                  videoId: session.videoId,
                  videoTitle: session.videoTitle,
                  channelName: session.channelName,
                  thumbnailUrl: session.thumbnailUrl,
                  watchedSeconds: session.watchedSeconds,
                  resumePositionSeconds: session.resumePositionSeconds,
                  durationSeconds: session.durationSeconds,
                  completed: session.completed,
                  lastWatchedAt: session.lastWatchedAt.toISOString(),
                }))}
              />
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-500">
                No public watch history yet.
              </div>
            )
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-500">
              Watch history is hidden by this user.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
