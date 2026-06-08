import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: '.vite/build/main',  // Ensure this ends with /main
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/main.js'),
      formats: ['cjs'],
      fileName: () => 'main.js'
    },
    rollupOptions: {
      external: ['electron'],
      // output: {
      //   entryFileNames: 'main.js',
      //   dir: '.vite/build/main'  // Add this line
      // }
    }
  }
});