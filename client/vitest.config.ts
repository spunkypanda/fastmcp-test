import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        // Required for localStorage to exist (opaque origins throw).
        url: "http://localhost:5173",
      },
    },
    setupFiles: ["./src/test/setup.ts"],
  },
});
