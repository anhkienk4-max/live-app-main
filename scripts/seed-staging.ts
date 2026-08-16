/**
 * Staging-only synthetic seed.
 *
 * Deterministic, rerun-safe (upsert by id), clearly non-production, independent
 * of real operational data. Refuses to run against the production Supabase URL.
 *
 * Usage (after staging migration chain is applied):
 *   SUPABASE_URL=<staging url> SUPABASE_SECRET_KEY=<staging service key> \
 *   node --import ./tests/typescript-alias-loader.mjs scripts/seed-staging.ts
 */
import { createClient } from "@supabase/supabase-js";

const PRODUCTION_URL = "egdjnpmoasarrttvhgds"; // project ref substring guard

function fail(message: string): never {
  throw new Error(message);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`Missing required environment variable: ${name}`);
  return value;
}

function assertStagingTarget(url: string): void {
  if (url.includes(PRODUCTION_URL)) {
    fail(
      "Refusing to seed: SUPABASE_URL points at the production project. " +
        "seed-staging is staging-only.",
    );
  }
}

async function main(): Promise<void> {
  const url = requiredEnv("SUPABASE_URL");
  const key = requiredEnv("SUPABASE_SECRET_KEY");
  assertStagingTarget(url);

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = new Date().toISOString();

  // Business users are created canonically by the migration chain
  // (20260811112834_p1b_production_bootstrap.sql) AFTER the six staging Auth
  // users + app_metadata exist. This seed MUST NOT create or overwrite
  // business_users; it only references the canonical ids (1-6) below.
  const canonicalBusinessUserIds = ["1", "2", "3", "4", "5", "6"] as const;
  // host1=3, host2=4, support1=5, technical1=6, leader=2, admin=1

  // Platforms / brands / campaigns (synthetic, [STAGING] prefix).
  const platforms = [
    { id: "stg-p1", name: "[STAGING] TikTok Shop" },
    { id: "stg-p2", name: "[STAGING] Shopee Live" },
  ] as const;
  for (const platform of platforms) {
    await supabase.from("platforms").upsert({
      id: platform.id, name: platform.name, platform_type: "Marketplace livestream",
      status: "active", created_at: now, updated_at: now,
    }, { onConflict: "id" });
  }

  const brands = [
    { id: "stg-b1", name: "[STAGING] Mars Snacking" },
    { id: "stg-b2", name: "[STAGING] Demo Beverages" },
  ] as const;
  for (const brand of brands) {
    await supabase.from("brands").upsert({
      id: brand.id, name: brand.name, status: "active", created_at: now, updated_at: now,
    }, { onConflict: "id" });
  }

  const campaigns = [
    { id: "stg-c1", name: "[STAGING] Q3 Launch", brand_id: "stg-b1", start_date: "2026-08-01", end_date: "2026-08-31", status: "active" },
  ] as const;
  for (const campaign of campaigns) {
    await supabase.from("campaigns").upsert({
      ...campaign, created_at: now, updated_at: now,
    }, { onConflict: "id" });
  }

  // Shifts: normal, overnight, multi-capacity, locked, unlocked.
  const shifts = [
    { id: "stg-s1", date: "2026-08-20", start_time: "10:00", end_time: "14:00", brand_id: "stg-b1", platform_id: "stg-p1", campaign_id: "stg-c1", title: "[STAGING] Mars Snacking", status: "scheduled", required_host_count: 1, required_support_count: 1, required_technical_count: 1, registration_locked: false },
    { id: "stg-s2", date: "2026-08-21", start_time: "22:00", end_time: "02:00", brand_id: "stg-b2", platform_id: "stg-p2", title: "[STAGING] Overnight", status: "scheduled", required_host_count: 2, required_support_count: 1, required_technical_count: 1, registration_locked: false },
    { id: "stg-s3", date: "2026-08-22", start_time: "09:00", end_time: "11:00", brand_id: "stg-b1", platform_id: "stg-p1", title: "[STAGING] Locked", status: "scheduled", required_host_count: 1, required_support_count: 1, required_technical_count: 1, registration_locked: true },
  ] as const;
  for (const shift of shifts) {
    await supabase.from("shifts").upsert({
      ...shift, timezone: "Asia/Ho_Chi_Minh", allow_multi_role: false,
      registration_cutoff_at: "2026-08-19T20:00:00.000Z",
      created_at: now, updated_at: now,
    }, { onConflict: "id" });
  }

  console.log("[OK] Staging seed applied (platforms, brands, campaigns, shifts).");
  console.log("      business_users are canonical from the bootstrap migration; ids: " + canonicalBusinessUserIds.join(", "));
  console.log("      Add registrations/manual assignments via the app UI or follow-up seed steps.");
}

main().catch((error: unknown) => {
  console.error(`[ERROR] ${error instanceof Error ? error.message : "Unknown seed failure."}`);
  process.exitCode = 1;
});
