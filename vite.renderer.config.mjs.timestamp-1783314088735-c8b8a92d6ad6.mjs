// vite.renderer.config.mjs
import { defineConfig } from "file:///C:/Mahnoor/SW%20Projects/FTM-Web/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Mahnoor/SW%20Projects/FTM-Web/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///C:/Mahnoor/SW%20Projects/FTM-Web/node_modules/@tailwindcss/vite/dist/index.mjs";
import path from "node:path";
var __vite_injected_original_dirname = "C:\\Mahnoor\\SW Projects\\FTM-Web";
var vite_renderer_config_default = defineConfig({
  root: "src",
  // where index.html & renderer.jsx live
  base: "./",
  // important for Electron relative paths
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(__vite_injected_original_dirname, ".vite/build/renderer/main_window"),
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5yZW5kZXJlci5jb25maWcubWpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiQzpcXFxcTWFobm9vclxcXFxTVyBQcm9qZWN0c1xcXFxGVE0tV2ViXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxNYWhub29yXFxcXFNXIFByb2plY3RzXFxcXEZUTS1XZWJcXFxcdml0ZS5yZW5kZXJlci5jb25maWcubWpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9NYWhub29yL1NXJTIwUHJvamVjdHMvRlRNLVdlYi92aXRlLnJlbmRlcmVyLmNvbmZpZy5tanNcIjsvLyB2aXRlLnJlbmRlcmVyLmNvbmZpZy5tanNcclxuaW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XHJcbmltcG9ydCB0YWlsd2luZGNzcyBmcm9tICdAdGFpbHdpbmRjc3Mvdml0ZSc7XHJcbmltcG9ydCBwYXRoIGZyb20gJ25vZGU6cGF0aCc7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gIHJvb3Q6ICdzcmMnLCAgICAgICAgICAgICAgICAgICAgIC8vIHdoZXJlIGluZGV4Lmh0bWwgJiByZW5kZXJlci5qc3ggbGl2ZVxyXG4gIGJhc2U6ICcuLycsICAgICAgICAgICAgICAgICAgICAgIC8vIGltcG9ydGFudCBmb3IgRWxlY3Ryb24gcmVsYXRpdmUgcGF0aHNcclxuICBwbHVnaW5zOiBbcmVhY3QoKSwgdGFpbHdpbmRjc3MoKV0sXHJcbiAgYnVpbGQ6IHtcclxuICAgIG91dERpcjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy52aXRlL2J1aWxkL3JlbmRlcmVyL21haW5fd2luZG93JyksIC8vIGZpbmFsIHByb2R1Y3Rpb24gZm9sZGVyXHJcbiAgICBlbXB0eU91dERpcjogdHJ1ZSwgICAgICAgICAgICAgLy8gY2xlYXIgZm9sZGVyIGJlZm9yZSBidWlsZFxyXG4gICAgYXNzZXRzRGlyOiAnLicsICAgICAgICAgICAgICAgIC8vIHB1dCBDU1MvSlMgbmV4dCB0byBpbmRleC5odG1sXHJcbiAgICByb2xsdXBPcHRpb25zOiB7XHJcbiAgICAgIGlucHV0OiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnc3JjL2luZGV4Lmh0bWwnKSwgLy8gZW50cnkgSFRNTFxyXG4gICAgICBvdXRwdXQ6IHtcclxuICAgICAgICBlbnRyeUZpbGVOYW1lczogJ3JlbmRlcmVyLmpzJywgICAvLyBtYXRjaCBpbmRleC5odG1sIHNjcmlwdFxyXG4gICAgICAgIGNodW5rRmlsZU5hbWVzOiAnW25hbWVdLmpzJyxcclxuICAgICAgICBhc3NldEZpbGVOYW1lczogJ1tuYW1lXS5bZXh0XScsICAvLyBDU1MsIGltYWdlcywgZXRjXHJcbiAgICAgIH0sXHJcbiAgICB9LFxyXG4gIH0sXHJcbiAgcmVzb2x2ZToge1xyXG4gICAgYWxpYXM6IHtcclxuICAgICAgJ0AnOiAnL3NyYycsXHJcbiAgICB9LFxyXG4gIH0sXHJcbiAgc2VydmVyOiB7XHJcbiAgICBwb3J0OiA1MTczLFxyXG4gIH0sXHJcbn0pO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQ0EsU0FBUyxvQkFBb0I7QUFDN0IsT0FBTyxXQUFXO0FBQ2xCLE9BQU8saUJBQWlCO0FBQ3hCLE9BQU8sVUFBVTtBQUpqQixJQUFNLG1DQUFtQztBQU16QyxJQUFPLCtCQUFRLGFBQWE7QUFBQSxFQUMxQixNQUFNO0FBQUE7QUFBQSxFQUNOLE1BQU07QUFBQTtBQUFBLEVBQ04sU0FBUyxDQUFDLE1BQU0sR0FBRyxZQUFZLENBQUM7QUFBQSxFQUNoQyxPQUFPO0FBQUEsSUFDTCxRQUFRLEtBQUssUUFBUSxrQ0FBVyxrQ0FBa0M7QUFBQTtBQUFBLElBQ2xFLGFBQWE7QUFBQTtBQUFBLElBQ2IsV0FBVztBQUFBO0FBQUEsSUFDWCxlQUFlO0FBQUEsTUFDYixPQUFPLEtBQUssUUFBUSxrQ0FBVyxnQkFBZ0I7QUFBQTtBQUFBLE1BQy9DLFFBQVE7QUFBQSxRQUNOLGdCQUFnQjtBQUFBO0FBQUEsUUFDaEIsZ0JBQWdCO0FBQUEsUUFDaEIsZ0JBQWdCO0FBQUE7QUFBQSxNQUNsQjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLO0FBQUEsSUFDUDtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxFQUNSO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
