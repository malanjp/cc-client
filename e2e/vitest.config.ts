import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 60000,
    hookTimeout: 30000,
    globals: true,
    environment: "node",
    include: ["specs/**/*.spec.ts"],
    globalSetup: ["./setup/globalSetup.ts"],
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
