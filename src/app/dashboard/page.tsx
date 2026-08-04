import { getSessionUser } from "@/lib/auth/session";
import { getUserTotalXp, calculateLevel } from "@/lib/xp";
import { db } from "@/db";
import { watchSessions } from "@/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { LogoutButton } from "@/components/logout-button";
import { ResendVerificationButton } from "@/components/resend-verification-button";
import { SearchBar } from "@/components/search-bar";
import { XpBar } from "@/components/xp-bar";
import { WatchHistory } from "@/components/watch-history";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center px-6 py-12 bg-slate-950">
        <p className="text-slate-400">You need to log in to view this page.</p>
      </main>
    );
  }

  const totalXp = await getUserTotalXp(user.id);
  const levelInfo = calculateLevel(totalXp);

  // Get recent watch history
  const recentWatches = await db
    .select()
    .from(watchSessions)
    .where(eq(watchSessions.userId, user.id))
    .orderBy(desc(watchSessions.lastWatchedAt))
    .limit(6);

  // Get total watch count
  const [watchCount] = await db
    .select({ value: count() })
    .from(watchSessions)
    .where(eq(watchSessions.userId, user.id));

  return (
    <main className="min-h-screen bg-slate-950">
      {/* Top Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-1.5">
            <svg className="w-7 h-7 text-red-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/>
              <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="white"/>
            </svg>
            <span className="text-lg font-bold text-white">you2ube</span>
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 text-sm">
            <span className="text-slate-400">Lvl {levelInfo.level}</span>
            <div className="w-24 h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400"
                style={{ width: `${Math.round(levelInfo.progress * 100)}%` }}
              />
            </div>
            <span className="text-yellow-400 font-medium">{totalXp} XP</span>
          </div>
          <Link href={`/users/${user.id}`} className="hidden text-sm font-medium text-slate-400 hover:text-white sm:inline">
            Public profile
          </Link>
          <Link href="/profile" className="flex items-center gap-2 rounded-full border border-slate-800 py-1 pl-1 pr-3 transition hover:bg-slate-900">
            <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-slate-800 text-xs font-bold text-slate-400">
              {user.profile?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.profile.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                (user.profile?.displayName ?? user.email).slice(0, 1).toUpperCase()
              )}
            </span>
            <span className="hidden text-sm text-slate-300 sm:inline">
              {user.profile?.displayName ?? user.email}
            </span>
          </Link>
          <LogoutButton />
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Email verification warning */}
        {!user.emailVerified && (
          <div className="mb-6 rounded-2xl border border-amber-800/50 bg-amber-900/20 p-5">
            <p className="text-sm font-medium text-amber-300">
              Your email address is not verified yet.
            </p>
            <p className="mt-1 text-sm text-amber-400/70">
              Verification links are printed to the server logs in this environment.
            </p>
            <ResendVerificationButton />
          </div>
        )}

        {/* Welcome + Stats */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Level</p>
            <p className="mt-1 text-3xl font-bold text-white">{levelInfo.level}</p>
            <XpBar progress={levelInfo.progress} current={levelInfo.currentLevelXp} next={levelInfo.nextLevelXp} />
          </div>
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total XP</p>
            <p className="mt-1 text-3xl font-bold text-yellow-400">{totalXp.toLocaleString()}</p>
            <p className="mt-2 text-xs text-slate-500">Earn XP by watching videos</p>
          </div>
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Videos Watched</p>
            <p className="mt-1 text-3xl font-bold text-white">{watchCount?.value ?? 0}</p>
            <p className="mt-2 text-xs text-slate-500">Total watch sessions</p>
          </div>
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Member Since</p>
            <p className="mt-1 text-lg font-bold text-white">
              {user.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
            <p className="mt-2 text-xs text-slate-500">{user.email}</p>
          </div>
        </div>

        {/* Search */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">🔍 Search YouTube</h2>
          <SearchBar />
        </section>

        {/* Watch History */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">📺 Recent Watch History</h2>
          {recentWatches.length === 0 ? (
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center">
              <p className="text-slate-400">No watch history yet.</p>
              <p className="mt-1 text-sm text-slate-500">
                Search for videos above and start watching to build your history!
              </p>
            </div>
          ) : (
            <WatchHistory sessions={recentWatches.map(s => ({
              id: s.id,
              videoId: s.videoId,
              videoTitle: s.videoTitle,
              channelName: s.channelName,
              thumbnailUrl: s.thumbnailUrl,
              watchedSeconds: s.watchedSeconds,
              durationSeconds: s.durationSeconds,
              completed: s.completed,
              lastWatchedAt: s.lastWatchedAt.toISOString(),
            }))} />
          )}
        </section>
      </div>
    </main>
  );
}
