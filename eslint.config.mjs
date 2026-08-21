import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local agent worktrees and archived/generated application snapshots are
    // not part of this repository's active runtime or test source.
    ".kilo/worktrees/**",
    "artifacts/**",
    ".migration-backup/**",
    "public/ocr/tesseract/**",
    "supabase/.temp/**",
  ]),
]);

export default eslintConfig;
