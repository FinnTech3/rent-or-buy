import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative base so the same build works at a domain root or under a
  // GitHub Pages project subpath. No client-side routing, so this is safe.
  base: "./",
  plugins: [react()],
  build: { target: "es2022", sourcemap: true },
  server: { port: 5173 },
});
