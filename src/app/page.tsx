import Link from "next/link";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await db.execute(sql`select 1`);
  const user = await getSessionUser();

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/>
              <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="white"/>
            </svg>
            <span className="text-xl font-bold text-white">you2ube</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-red-600/10 px-4 py-1.5 text-sm font-medium text-red-400 mb-6 border border-red-600/20">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          YouTube + Social Experience
        </div>
        <h1 className="max-w-4xl text-5xl sm:text-6xl font-bold tracking-tight text-white leading-tight">
          Watch. Earn.{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-400">
            Level Up.
          </span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-400 leading-relaxed">
          Search and watch YouTube videos while earning XP, unlocking achievements, and tracking
          your watch sessions. Your personalized YouTube + social experience.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          {user ? (
            <Link
              href="/dashboard"
              className="rounded-xl bg-red-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-red-600/25 transition hover:bg-red-500 hover:shadow-red-500/30"
            >
              Go to Dashboard →
            </Link>
          ) : (
            <>
              <Link
                href="/signup"
                className="rounded-xl bg-red-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-red-600/25 transition hover:bg-red-500 hover:shadow-red-500/30"
              >
                Get Started Free
              </Link>
              <Link
                href="/login"
                className="rounded-xl border border-slate-600 px-8 py-3.5 text-base font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
              >
                Log In
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-5xl grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl bg-slate-900/50 border border-slate-800 p-6">
            <div className="text-3xl mb-3">🔍</div>
            <h3 className="text-lg font-semibold text-white">YouTube Search</h3>
            <p className="mt-2 text-sm text-slate-400">
              Search and discover YouTube videos directly within the app. Full metadata, thumbnails, and instant playback.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-900/50 border border-slate-800 p-6">
            <div className="text-3xl mb-3">⚡</div>
            <h3 className="text-lg font-semibold text-white">XP & Leveling</h3>
            <p className="mt-2 text-sm text-slate-400">
              Earn XP for watching videos, completing sessions, and daily logins. Level up and track your progress.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-900/50 border border-slate-800 p-6">
            <div className="text-3xl mb-3">🏆</div>
            <h3 className="text-lg font-semibold text-white">Achievements</h3>
            <p className="mt-2 text-sm text-slate-400">
              Unlock achievements as you use the platform. Each milestone rewards you with bonus XP.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-900/50 border border-slate-800 p-6">
            <div className="text-3xl mb-3">📊</div>
            <h3 className="text-lg font-semibold text-white">Watch Sessions</h3>
            <p className="mt-2 text-sm text-slate-400">
              Track your viewing history, watch time, and completion rates across all your sessions.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-900/50 border border-slate-800 p-6">
            <div className="text-3xl mb-3">🔐</div>
            <h3 className="text-lg font-semibold text-white">Secure Auth</h3>
            <p className="mt-2 text-sm text-slate-400">
              Self-hosted authentication with secure sessions, email verification, and password reset.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-900/50 border border-slate-800 p-6">
            <div className="text-3xl mb-3">👤</div>
            <h3 className="text-lg font-semibold text-white">User Profiles</h3>
            <p className="mt-2 text-sm text-slate-400">
              Personalized profiles with display names, avatars, and social stats.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-6 py-8 text-center text-sm text-slate-500">
        you2ube — A YouTube + social experience. Built with Next.js & PostgreSQL.
      </footer>
    </main>
  );
}
