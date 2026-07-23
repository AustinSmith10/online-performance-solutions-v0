import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    exclude: [
      ...configDefaults.exclude,
      // *.concurrency.test.ts hits a real local Supabase Postgres (npx
      // supabase start) rather than mocks — run separately via
      // `npm run test:concurrency`, not as part of the default unit-test run.
      "**/*.concurrency.test.ts",
      // Nested git worktrees (e.g. .claude/worktrees/<name>) can be checked
      // out at a different commit than this tree — without this, vitest's
      // default globbing walks into them and runs their (possibly
      // out-of-sync) test files against their own code, producing failures
      // that have nothing to do with this checkout.
      "**/.claude/worktrees/**",
    ],
  },
});
