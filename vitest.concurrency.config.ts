import { defineConfig } from "vitest/config";
import path from "path";

// Separate config for *.concurrency.test.ts: real integration tests against a
// locally-running Supabase Postgres (npx supabase start), never mocks. Run
// via `npm run test:concurrency`, kept out of the default `npm run test`
// pass (see vitest.config.ts) since it needs Docker/Postgres up and is much
// slower than the rest of the suite.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.concurrency.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
