import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // three + drei make one large vendor chunk; that's expected for this app.
  build: { chunkSizeWarningLimit: 1500 },
});
