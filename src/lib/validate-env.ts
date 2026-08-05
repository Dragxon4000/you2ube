/**
 * Validate required environment variables at module load time. Imported
 * from instrumentation.ts so it runs once on server startup, failing fast
 * with a clear error message rather than crashing on the first request.
 *
 * Variables are split into two categories:
 *   - REQUIRED:   app cannot start without these
 *   - OPTIONAL:   features degrade gracefully if missing (logged at startup)
 */

interface EnvSpec {
  name: string;
  required: boolean;
  description: string;
}

const ENV_SPECS: EnvSpec[] = [
  { name: "DATABASE_URL", required: true, description: "PostgreSQL connection string" },
  { name: "DISCORD_CLIENT_ID", required: false, description: "Discord OAuth app ID (Discord features disabled if missing)" },
  { name: "DISCORD_CLIENT_SECRET", required: false, description: "Discord OAuth secret (Discord features disabled if missing)" },
  { name: "DISCORD_WEBHOOK_URL", required: false, description: "Discord webhook for bot notifications" },
  { name: "NEXT_PUBLIC_APP_URL", required: false, description: "Public URL of the app (used for OAuth redirect + sitemap)" },
];

export function validateEnvironment(): void {
  const missing: EnvSpec[] = [];
  const optional: EnvSpec[] = [];

  for (const spec of ENV_SPECS) {
    const value = process.env[spec.name];
    if (!value || value.trim() === "") {
      if (spec.required) missing.push(spec);
      else optional.push(spec);
    }
  }

  if (missing.length > 0) {
    const message = [
      "Missing required environment variables:",
      ...missing.map(s => `  - ${s.name}: ${s.description}`),
      "",
      "Set them in .env or your deployment platform before starting the server.",
    ].join("\n");
    throw new Error(message);
  }

  if (optional.length > 0 && process.env.NODE_ENV !== "test") {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        message: "Optional environment variables not set (features degraded)",
        variables: optional.map(s => s.name),
      }),
    );
  }
}
