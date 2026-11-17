import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  // Only HUNU_API_URL is read: it is public. Nothing else from the env files (the
  // database URL in particular) may reach the bundle.
  const { HUNU_API_URL = '', HUNU_AFFILIATES = '' } = { ...loadEnv(mode, import.meta.dirname, 'HUNU_'), ...process.env };

  return {
    plugins: [react(), tailwindcss()],
    define: {
      __HUNU_API_URL__: JSON.stringify(HUNU_API_URL),
      __HUNU_AFFILIATES__: JSON.stringify(HUNU_AFFILIATES)
    },
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      rollupOptions: {
        input: {
          popup: resolve(import.meta.dirname, 'popup.html'),
          sidepanel: resolve(import.meta.dirname, 'sidepanel.html')
        },
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]'
        }
      }
    }
  };
});
