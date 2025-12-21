import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Vite configuration for the Sunside SPA.
// This is intentionally minimal and can be extended as needed.
export default defineConfig(() => {
  const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
  return {
    // On GitHub Pages, the app is served under "/<repo>/". Use a dynamic base so local dev stays at "/".
    base: process.env.GITHUB_ACTIONS && repoName ? `/${repoName}/` : '/',
    plugins: [svelte()],
    build: {
      target: 'esnext'
    }
  };
});
