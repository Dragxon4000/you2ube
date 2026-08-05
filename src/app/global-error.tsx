"use client";

/**
 * Global error boundary for the Next.js App Router. Catches any error that
 * bubbles up from server components or client components that don't have
 * their own ErrorBoundary. Provides a retry button that calls `reset()`
 * (Next.js-provided) to re-render the failed subtree.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 antialiased">
        <main
          id="main-content"
          className="grid min-h-screen place-items-center px-6"
        >
          <div
            role="alert"
            aria-live="assertive"
            className="max-w-md rounded-3xl border-2 border-red-200 bg-white p-10 text-center shadow-xl"
          >
            <div className="text-6xl" aria-hidden="true">⚠️</div>
            <h1 className="mt-4 text-3xl font-bold text-red-900">
              Something went wrong
            </h1>
            <p className="mt-2 text-slate-600">
              We hit an unexpected error. The issue has been logged.
            </p>
            {error.digest && (
              <p className="mt-3 text-xs font-mono text-slate-400">
                Error ID: {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              className="mt-6 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
