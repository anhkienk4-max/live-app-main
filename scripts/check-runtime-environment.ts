/**
 * Fail-closed environment guard — blocks the app from running/building against
 * the PRODUCTION Supabase project from local development or Vercel preview.
 *
 * Rules:
 *   - LOCAL (NODE_ENV != production, VERCEL_ENV unset) + prod URL  -> exit 1
 *   - PREVIEW (VERCEL_ENV=preview) + prod URL                      -> exit 1
 *   - PRODUCTION (VERCEL_ENV=production) + prod URL                -> allowed
 *   - local/preview + non-production URL                           -> allowed
 *
 * Wired into `next dev` and `next build` (see package.json) BEFORE app startup.
 * This is a process/build guard, NOT frontend authorization. The production
 * project ref is not a secret and is compared safely. Never prints secrets.
 */
const PRODUCTION_PROJECT_REF = "egdjnpmoasarrttvhgds";

function fail(message: string): never {
  console.error(`[ENV GUARD] ${message}`);
  process.exit(1);
}

function resolveSupabaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

function isProductionUrl(url: string): boolean {
  return url.includes(`/${PRODUCTION_PROJECT_REF}`) || url.includes(PRODUCTION_PROJECT_REF);
}

function mode(): "local" | "preview" | "production" {
  if (process.env.VERCEL_ENV === "production") return "production";
  if (process.env.VERCEL_ENV === "preview") return "preview";
  // Vercel sets NODE_ENV=production for builds; local dev has NODE_ENV=development.
  if (process.env.NODE_ENV === "production") return "local-build";
  return "local";
}

function main(): void {
  const url = resolveSupabaseUrl();
  const currentMode = mode();

  // No Supabase URL configured: let the app fail-closed at runtime (authGuards).
  if (!url) {
    console.log("[ENV GUARD] NEXT_PUBLIC_SUPABASE_URL not set; skipping URL check.");
    return;
  }

  const pointsAtProduction = isProductionUrl(url);

  if (currentMode === "production") {
    if (!pointsAtProduction) {
      fail(`VERCEL production deployment must use the production Supabase project.`);
    }
    console.log("[ENV GUARD] Production deployment + production Supabase OK.");
    return;
  }

  if (currentMode === "preview" && pointsAtProduction) {
    fail(
      "Vercel PREVIEW must NOT use the production Supabase project. " +
        "Configure preview env to point at the staging project.",
    );
  }

  if (currentMode === "local" && pointsAtProduction) {
    fail(
      "Local development must NOT run against the production Supabase project. " +
        "Use a local/dev Supabase or mock mode.",
    );
  }

  console.log(`[ENV GUARD] ${currentMode} + non-production Supabase OK.`);
}

main();
