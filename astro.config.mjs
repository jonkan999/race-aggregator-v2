import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [react()],
  output: 'static',
  vite: {
    optimizeDeps: {
      // Force a fresh prebundle in dev so React's JSX runtimes are served as
      // Vite-compatible ESM wrappers instead of stale cached output.
      force: true,
    },
    ssr: {
      noExternal: ['mapbox-gl'],
    },
  },
});
