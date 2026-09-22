import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages: https://<owner>.github.io/Wayclip_Shorts/ → base 경로 고정. HashRouter 라 404 리라이트 불필요.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? "/Wayclip_Shorts/",
  build: { outDir: "dist", sourcemap: false },
});
