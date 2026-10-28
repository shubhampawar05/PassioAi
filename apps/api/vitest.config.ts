import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Integration tests share one Postgres test database.
    fileParallelism: false,
    env: {
      TEST_DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgresql://passio:passio_dev_password@localhost:5432/passio_poc_test",
    },
  },
});
