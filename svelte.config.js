/** @type {import('@sveltejs/vite-plugin-svelte').SvelteConfig} */
const config = {
  compilerOptions: {
    // Enable dev mode warnings in development builds.
    dev: process.env.NODE_ENV !== 'production'
  }
};

export default config;

