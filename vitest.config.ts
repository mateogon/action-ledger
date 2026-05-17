import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@action-ledger/core": `${root}packages/core/src/index.ts`,
      "@action-ledger/cli": `${root}packages/cli/src/index.ts`,
      "@action-ledger/reminders-sync": `${root}packages/reminders-sync/src/index.ts`,
      "@action-ledger/mcp-server": `${root}packages/mcp-server/src/index.ts`
    }
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    pool: "forks"
  }
});
