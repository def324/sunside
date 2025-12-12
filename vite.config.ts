import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Vite configuration for the Sunside SPA.
// This is intentionally minimal and can be extended as needed.
export default defineConfig({
  plugins: [svelte()],
  build: {
    target: 'esnext'
  }
});

