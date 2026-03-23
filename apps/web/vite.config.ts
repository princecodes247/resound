import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  build: {
    rollupOptions: {
      input: {
        main: "./index.html",
        processor: "./src/audio/processor.ts",
      },
      output: {
        entryFileNames: (chunkInfo) => {
          return chunkInfo.name === "processor"
            ? "assets/[name].js"
            : "assets/[name]-[hash].js";
        },
      },
    },
  },
});
