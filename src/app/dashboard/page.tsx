import { getSessionUser } from "@/lib/auth/session";
import { LogoutButton } from "@/components/logout-button";
import { ResendVerificationButton } from "@/components/resend-verification-button";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Middleware already guarantees a valid session for this route, but we
  // still read it here (defense in depth + to render the user's data).
  const user = await getSessionUser();

  if (!user) {
    // Should be unreachable thanks to middleware, but keep it safe.
    return (
      <main className="grid min-h-screen place-items-center px-6 py-12">
        <p className="text-slate-600">You need to log in to view this page.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.08em] text-slate-600">Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">
              Welcome, {user.profile?.displayName ?? user.email}
            </h1>
          </div>
          <LogoutButton />
        </div>

        {!user.emailVerified && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-medium text-amber-900">
              Your email address is not verified yet.
            </p>
            <p className="mt-1 text-sm text-amber-800">
              No email provider is configured in this environment, so verification links are
              printed to the server logs instead of emailed.
            </p>
            <ResendVerificationButton />
          </div>
        )}

        <section className="mt-8 rounded-3xl bg-white p-8 shadow-[0_24px_60px_rgba(16,24,40,0.08)]">
          <h2 className="text-lg font-semibold text-slate-950">Account details</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Email</dt>
              <dd className="mt-1 text-sm text-slate-900">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Email verified</dt>
              <dd className="mt-1 text-sm text-slate-900">{user.emailVerified ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Display name</dt>
              <dd className="mt-1 text-sm text-slate-900">{user.profile?.displayName}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Member since</dt>
              <dd className="mt-1 text-sm text-slate-900">
                {user.createdAt.toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </section>

        <p className="mt-6 text-sm text-slate-500">
          This page is protected by middleware — it redirects to{" "}
          <code className="rounded bg-slate-200 px-1.5 py-0.5">/login</code> automatically if you
          are not authenticated, and your session survives a full page refresh.
        </p>
      </div>
    </main>
  );
}
