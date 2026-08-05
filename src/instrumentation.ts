/**
 * Next.js instrumentation hook. Runs once on server startup, before any
 * request is handled. Used to validate environment variables early so we
 * fail fast with a clear error instead of crashing on the first request.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
import { validateEnvironment } from "@/lib/validate-env";

export async function register() {
  // Only run in the Node.js runtime (not the Edge runtime).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    validateEnvironment();
  }
}
