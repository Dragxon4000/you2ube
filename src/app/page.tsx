import Link from "next/link";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/session";
import { LogoutButton } from "@/components/logout-button";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await db.execute(sql`select 1`);
  const user = await getSessionUser();

  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <section className="w-full max-w-2xl rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">you2ube</p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
          Self-hosted authentication, built with Next.js &amp; PostgreSQL
        </h1>
        <p className="mt-4 text-base text-slate-700">
          Signup, login, sessions, protected routes, and password reset — all backed by a single
          Drizzle/PostgreSQL auth system.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-xl bg-slate-900 px-5 py-2.5 font-semibold text-white transition hover:bg-slate-800"
              >
                Go to dashboard
              </Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link
                href="/signup"
                className="rounded-xl bg-slate-900 px-5 py-2.5 font-semibold text-white transition hover:bg-slate-800"
              >
                Create an account
              </Link>
              <Link
                href="/login"
                className="rounded-xl border border-slate-300 px-5 py-2.5 font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Log in
              </Link>
            </>
          )}
        </div>

        {user && (
          <p className="mt-6 text-sm text-slate-500">
            Logged in as <span className="font-medium text-slate-800">{user.email}</span>
          </p>
        )}
      </section>
    </main>
  );
}
