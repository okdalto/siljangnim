import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
      '/api/github-proxy': {
        target: 'https://github.com',
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost');
          const endpoint = url.searchParams.get('endpoint') || '';
          return '/login/' + endpoint;
        },
      },
      '/api': {
        target: 'http://localhost:8000',
      },
    },
  },
})
