import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { renameSync, existsSync, rmSync } from 'fs';

/**
 * The website: a static build in dist-web that any host can serve. Only the public
 * HUNU_API_URL and HUNU_AFFILIATES are read from the env files; nothing else (the
 * database URL in particular) reaches the bundle.
 */
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, import.meta.dirname, 'HUNU_'), ...process.env };
  const { HUNU_API_URL = '', HUNU_AFFILIATES = '' } = env;

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        // Served as the site's home page.
        name: 'hunu-web-index',
        closeBundle() {
          const out = resolve(import.meta.dirname, 'dist-web');
          if (existsSync(resolve(out, 'web.html'))) renameSync(resolve(out, 'web.html'), resolve(out, 'index.html'));
          // public/ also holds the extension's manifest, which has no place on the website.
          if (existsSync(resolve(out, 'manifest.json'))) rmSync(resolve(out, 'manifest.json'));
        }
      }
    ],
    define: {
      __HUNU_API_URL__: JSON.stringify(HUNU_API_URL),
      __HUNU_AFFILIATES__: JSON.stringify(HUNU_AFFILIATES)
    },
    publicDir: 'public',
    server: { port: 5175 },
    build: {
      outDir: 'dist-web',
      emptyOutDir: true,
      rollupOptions: {
        input: { web: resolve(import.meta.dirname, 'web.html') }
      }
    }
  };
});
