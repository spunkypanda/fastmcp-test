import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy MCP + login traffic to the FastMCP server so the browser
// never hits CORS in dev.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/mcp": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/login": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
