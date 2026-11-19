import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // TanStack Virtual uses mutable functions on its virtualizer instance.
    // Restrict this override strictly to the EnterpriseDataTable component.
    files: ["components/ui/enterprise-data-table.tsx"],
    rules: {
      "react-hooks/incompatible-library": "off",
    },
  },
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
    ".rc16k-checkpoints/**",
    "public/ocr/tesseract/**",
    "supabase/.temp/**",
    // Static visual-clone files — pixel-faithful reference mocks, not
    // production source. They are typed loosely by design and must not
    // be reformatted by linting automation.
    "components/visual-qa/**",
  ]),
]);

export default eslintConfig;
