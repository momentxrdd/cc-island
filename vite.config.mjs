import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import sveltePreprocess from 'svelte-preprocess';

export default defineConfig({
  plugins: [svelte({ preprocess: sveltePreprocess({ sourceMap: false }) })],
  build: {
    outDir: 'ui',
    emptyOutDir: true,
    sourcemap: false,
    target: 'chrome120',
    cssCodeSplit: false,
    rollupOptions: {
      input: 'src/full/main.js',
      output: {
        format: 'iife',
        entryFileNames: 'full.js',
        assetFileNames: 'full.[ext]',
      },
    },
  },
});
