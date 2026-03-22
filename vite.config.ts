import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Tauri expects a fixed port for development
  server: {
    port: 5173,
    strictPort: true,
  },
  // Ensure the build output is in the same directory as before
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
