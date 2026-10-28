import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Dev only: forward /api to the local Express API. The browser never calls Passio.
    proxy: { "/api": process.env.VITE_API_PROXY ?? "http://localhost:3001" },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.tsx"],
    setupFiles: ["test/setup.ts"],
  },
});
