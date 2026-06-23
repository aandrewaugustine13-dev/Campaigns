import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Standalone vitest config (kept separate from vite.config.ts so the dev-server
// middleware there isn't loaded for tests). Headless DOM via happy-dom for the
// React engine integration test.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
    globals: true,
  },
});
