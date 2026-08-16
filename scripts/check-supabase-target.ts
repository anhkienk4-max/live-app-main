/**
 * Release guard: verify the current Supabase CLI target before any db push.
 *
 * Usage:
 *   node --import ./tests/typescript-alias-loader.mjs scripts/check-supabase-target.ts
 *   EXPECT_TARGET=<ref> node --import ./tests/typescript-alias-loader.mjs scripts/check-supabase-target.ts
 *
 * - Prints the linked project ref/name.
 * - If EXPECT_TARGET is set, fails when it does not match (prevents pushing the
 *   wrong project).
 * - Refuses to continue when the linked project is the production ref unless
 *   ALLOW_PRODUCTION=1 is set (double gate for db push).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PRODUCTION_REF = "egdjnpmoasarrttvhgds";

const tempDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "supabase",
  ".temp",
);

function fail(message: string): never {
  throw new Error(message);
}

async function linkedProjectRef(): Promise<string> {
  const linkFile = path.join(tempDir, "linked-project.json");
  try {
    const raw = await readFile(linkFile, "utf8");
    const parsed = JSON.parse(raw) as { ref?: string; name?: string };
    if (!parsed.ref) fail("linked-project.json is missing ref.");
    return parsed.ref;
  } catch {
    fail("Unable to read supabase/.temp/linked-project.json — is the project linked?");
  }
}

async function main(): Promise<void> {
  const ref = await linkedProjectRef();
  const expected = process.env.EXPECT_TARGET?.trim();
  const allowProduction = process.env.ALLOW_PRODUCTION === "1";

  console.log(`[TARGET] linked Supabase ref: ${ref}`);

  if (expected && ref !== expected) {
    fail(
      `Target mismatch: expected ${expected}, linked project is ${ref}. ` +
        "Refusing to proceed.",
    );
  }

  if (ref === PRODUCTION_REF && !allowProduction) {
    fail(
      `Linked project is PRODUCTION (${PRODUCTION_REF}). ` +
        "Set ALLOW_PRODUCTION=1 only when you explicitly intend a production push.",
    );
  }

  console.log("[OK] Target check passed.");
}

main().catch((error: unknown) => {
  console.error(
    `[ERROR] ${error instanceof Error ? error.message : "Unknown target check failure."}`,
  );
  process.exitCode = 1;
});
