// vite.renderer.config.mjs
import { defineConfig } from "file:///C:/SW%20Projects/SCTTM-VD/node_modules/vite/dist/node/index.js";
import react from "file:///C:/SW%20Projects/CTTM-VD/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///C:/SW%20Projects/CTTM-VD/node_modules/@tailwindcss/vite/dist/index.mjs";
import path from "node:path";
var __vite_injected_original_dirname = "C:\\SW Projects\\CTTM-VD";
var vite_renderer_config_default = defineConfig({
  root: "src",
  // where index.html & renderer.jsx live
  base: "./",
  // important for Electron relative paths
  plugins: [react(), tailwindcss()],
  build: {
    outDir: ".vite/build/renderer/main_window",
    // final production folder
    emptyOutDir: true,
    // clear folder before build
    assetsDir: ".",
    // put CSS/JS next to index.html
    rollupOptions: {
      input: path.resolve(__vite_injected_original_dirname, "src/index.html"),
      // entry HTML
      output: {
        entryFileNames: "renderer.js",
        // match index.html script
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]"
        // CSS, images, etc
      }
    }
  },
  resolve: {
    alias: {
      "@": "/src"
    }
  },
  server: {
    port: 5173
  }
});
export {
  vite_renderer_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5yZW5kZXJlci5jb25maWcubWpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiQzpcXFxcU1cgUHJvamVjdHNcXFxcU0NUVE0tVl8zLjAuMFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcU1cgUHJvamVjdHNcXFxcU0NUVE0tVl8zLjAuMFxcXFx2aXRlLnJlbmRlcmVyLmNvbmZpZy5tanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1NXJTIwUHJvamVjdHMvU0NUVE0tVl8zLjAuMC92aXRlLnJlbmRlcmVyLmNvbmZpZy5tanNcIjsvLyB2aXRlLnJlbmRlcmVyLmNvbmZpZy5tanNcclxuaW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XHJcbmltcG9ydCB0YWlsd2luZGNzcyBmcm9tICdAdGFpbHdpbmRjc3Mvdml0ZSc7XHJcbmltcG9ydCBwYXRoIGZyb20gJ25vZGU6cGF0aCc7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gIHJvb3Q6ICdzcmMnLCAgICAgICAgICAgICAgICAgICAgIC8vIHdoZXJlIGluZGV4Lmh0bWwgJiByZW5kZXJlci5qc3ggbGl2ZVxyXG4gIGJhc2U6ICcuLycsICAgICAgICAgICAgICAgICAgICAgIC8vIGltcG9ydGFudCBmb3IgRWxlY3Ryb24gcmVsYXRpdmUgcGF0aHNcclxuICBwbHVnaW5zOiBbcmVhY3QoKSwgdGFpbHdpbmRjc3MoKV0sXHJcbiAgYnVpbGQ6IHtcclxuICAgIG91dERpcjogJy52aXRlL2J1aWxkL3JlbmRlcmVyL21haW5fd2luZG93JywgLy8gZmluYWwgcHJvZHVjdGlvbiBmb2xkZXJcclxuICAgIGVtcHR5T3V0RGlyOiB0cnVlLCAgICAgICAgICAgICAvLyBjbGVhciBmb2xkZXIgYmVmb3JlIGJ1aWxkXHJcbiAgICBhc3NldHNEaXI6ICcuJywgICAgICAgICAgICAgICAgLy8gcHV0IENTUy9KUyBuZXh0IHRvIGluZGV4Lmh0bWxcclxuICAgIHJvbGx1cE9wdGlvbnM6IHtcclxuICAgICAgaW5wdXQ6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICdzcmMvaW5kZXguaHRtbCcpLCAvLyBlbnRyeSBIVE1MXHJcbiAgICAgIG91dHB1dDoge1xyXG4gICAgICAgIGVudHJ5RmlsZU5hbWVzOiAncmVuZGVyZXIuanMnLCAgIC8vIG1hdGNoIGluZGV4Lmh0bWwgc2NyaXB0XHJcbiAgICAgICAgY2h1bmtGaWxlTmFtZXM6ICdbbmFtZV0uanMnLFxyXG4gICAgICAgIGFzc2V0RmlsZU5hbWVzOiAnW25hbWVdLltleHRdJywgIC8vIENTUywgaW1hZ2VzLCBldGNcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgfSxcclxuICByZXNvbHZlOiB7XHJcbiAgICBhbGlhczoge1xyXG4gICAgICAnQCc6ICcvc3JjJyxcclxuICAgIH0sXHJcbiAgfSxcclxuICBzZXJ2ZXI6IHtcclxuICAgIHBvcnQ6IDUxNzMsXHJcbiAgfSxcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFDQSxTQUFTLG9CQUFvQjtBQUM3QixPQUFPLFdBQVc7QUFDbEIsT0FBTyxpQkFBaUI7QUFDeEIsT0FBTyxVQUFVO0FBSmpCLElBQU0sbUNBQW1DO0FBTXpDLElBQU8sK0JBQVEsYUFBYTtBQUFBLEVBQzFCLE1BQU07QUFBQTtBQUFBLEVBQ04sTUFBTTtBQUFBO0FBQUEsRUFDTixTQUFTLENBQUMsTUFBTSxHQUFHLFlBQVksQ0FBQztBQUFBLEVBQ2hDLE9BQU87QUFBQSxJQUNMLFFBQVE7QUFBQTtBQUFBLElBQ1IsYUFBYTtBQUFBO0FBQUEsSUFDYixXQUFXO0FBQUE7QUFBQSxJQUNYLGVBQWU7QUFBQSxNQUNiLE9BQU8sS0FBSyxRQUFRLGtDQUFXLGdCQUFnQjtBQUFBO0FBQUEsTUFDL0MsUUFBUTtBQUFBLFFBQ04sZ0JBQWdCO0FBQUE7QUFBQSxRQUNoQixnQkFBZ0I7QUFBQSxRQUNoQixnQkFBZ0I7QUFBQTtBQUFBLE1BQ2xCO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLEtBQUs7QUFBQSxJQUNQO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLEVBQ1I7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
