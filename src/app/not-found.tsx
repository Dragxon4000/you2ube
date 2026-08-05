import Link from "next/link";

export const metadata = {
  title: "404 — Page not found",
};

/**
 * Custom 404 page. Next.js App Router uses this automatically for unmatched
 * routes. Provides a friendly fallback with a link back to the home page.
 */
export default function NotFound() {
  return (
    <main
      id="main-content"
      className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 px-6"
    >
      <div className="max-w-md rounded-3xl bg-white p-10 text-center shadow-xl">
        <div className="text-6xl" aria-hidden="true">🎬</div>
        <h1 className="mt-4 text-5xl font-bold text-slate-900">404</h1>
        <p className="mt-2 text-lg text-slate-600">
          This page doesn&apos;t exist. Maybe it was never filmed.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Back to you2ube
        </Link>
      </div>
    </main>
  );
}
