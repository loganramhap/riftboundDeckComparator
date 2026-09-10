import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // The link-import proxy is served by the Node/Fastify server (task 10).
      "/api": "http://localhost:3000",
    },
  },
});
