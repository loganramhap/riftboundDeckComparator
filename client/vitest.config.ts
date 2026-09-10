import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Dedicated Vitest config for the client package. Uses the jsdom environment
// so React components can be rendered and queried with Testing Library. Shared
// across client component tests (tasks 11.2, 12.3, 12.4).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
