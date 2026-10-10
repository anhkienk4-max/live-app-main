/**
 * Fail-closed environment guard — blocks the app from running/building against
 * the PRODUCTION Supabase project from local development or Vercel preview,
 * AND enforces that Preview and Production deployments have all mandatory
 * Supabase configuration present (fail-closed if missing).
 *
 * Rules:
 *   - PREVIEW (VERCEL_ENV=preview):
 *       - NEXT_PUBLIC_SUPABASE_URL missing -> exit 1 (cannot be Preview-ready without Supabase)
 *       - NEXT_PUBLIC_SUPABASE_ANON_KEY missing -> exit 1
 *       - URL points to PRODUCTION (egdjnpmoasarrttvhgds) -> exit 1 (STAGING amagnzebmmuqiptmrjmc required)
 *       - URL points to non-production -> allowed
 *   - PRODUCTION (VERCEL_ENV=production):
 *       - NEXT_PUBLIC_SUPABASE_URL missing -> exit 1
 *       - NEXT_PUBLIC_SUPABASE_ANON_KEY missing -> exit 1
 *       - URL does NOT point to PRODUCTION -> exit 1
 *   - LOCAL (NODE_ENV != production, VERCEL_ENV unset):
 *       - URL points to PRODUCTION -> exit 1
 *       - URL missing -> allowed (can run in local development mock mode)
 *
 * Wired into `next dev` and `next build` (see package.json) BEFORE app startup.
 * Never prints secrets. Target project ref is compared safely.
 */
const PRODUCTION_PROJECT_REF = "egdjnpmoasarrttvhgds";
const STAGING_PROJECT_REF = "amagnzebmmuqiptmrjmc";

type RuntimeMode = "local" | "local-build" | "preview" | "production";

function fail(message: string): never {
  console.error(`[ENV GUARD] ${message}`);
  process.exit(1);
}

function resolveSupabaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

function resolveSupabaseAnonKey(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!raw) return null;
  return raw;
}

function isProductionUrl(url: string): boolean {
  return url.includes(`/${PRODUCTION_PROJECT_REF}`) || url.includes(PRODUCTION_PROJECT_REF);
}

function isStagingUrl(url: string): boolean {
  return url.includes(`/${STAGING_PROJECT_REF}`) || url.includes(STAGING_PROJECT_REF);
}

function mode(): RuntimeMode {
  if (process.env.VERCEL_ENV === "production") return "production";
  if (process.env.VERCEL_ENV === "preview") return "preview";
  if (process.env.NODE_ENV === "production") return "local-build";
  return "local";
}

function main(): void {
  const url = resolveSupabaseUrl();
  const anonKey = resolveSupabaseAnonKey();
  const currentMode = mode();

  if (currentMode === "preview") {
    if (!url) {
      fail(
        "Missing mandatory Supabase configuration: NEXT_PUBLIC_SUPABASE_URL is not set. " +
          "Vercel Preview deployments cannot be considered Preview-ready without Supabase configuration."
      );
    }
    if (!anonKey) {
      fail(
        "Missing mandatory Supabase configuration: NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. " +
          "Vercel Preview deployments cannot be considered Preview-ready without Supabase configuration."
      );
    }
    if (isProductionUrl(url)) {
      fail(
        "Vercel PREVIEW must NOT use the production Supabase project (egdjnpmoasarrttvhgds). " +
          "Configure preview environment to point at the STAGING project (amagnzebmmuqiptmrjmc)."
      );
    }
    const isStaging = isStagingUrl(url);
    console.log(
      `[ENV GUARD] Preview deployment target verified: ${isStaging ? "STAGING OK (" + STAGING_PROJECT_REF + ")" : "non-production OK"}.`
    );
    return;
  }

  if (currentMode === "production") {
    if (!url || !anonKey) {
      fail("Production deployment requires both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    }
    if (!isProductionUrl(url)) {
      fail("VERCEL production deployment must use the production Supabase project.");
    }
    console.log("[ENV GUARD] Production deployment + production Supabase OK.");
    return;
  }

  // Local build or local development
  if (!url) {
    console.log("[ENV GUARD] NEXT_PUBLIC_SUPABASE_URL not set; local mode allowed.");
    return;
  }

  const pointsAtProduction = isProductionUrl(url);
  if (pointsAtProduction) {
    fail(
      "Local environment must NOT run against the production Supabase project (egdjnpmoasarrttvhgds). " +
        "Use a local/dev Supabase or mock mode."
    );
  }

  console.log(`[ENV GUARD] ${currentMode} + non-production Supabase OK.`);
}

main();
