import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@xyflow/react')) return 'flow-vendor'
            if (
              id.includes('react-dom') ||
              id.includes('/react/') ||
              id.includes('/scheduler/')
            ) {
              return 'react-vendor'
            }
            if (id.includes('jszip') || id.includes('fflate')) return 'zip-vendor'
            if (id.includes('mp4box') || id.includes('mp4-muxer') || id.includes('webm-muxer')) return 'media-vendor'
            if (id.includes('react-markdown')) return 'markdown-vendor'
          }

          if (
            id.includes('/src/engine/GLEngine.js') ||
            id.includes('/src/engine/gpu/') ||
            id.includes('/src/nodes/viewport/')
          ) {
            return 'editor-runtime'
          }

          if (
            id.includes('/src/config/nodeConfig.js') ||
            id.includes('/src/nodes/') ||
            id.includes('/src/components/chat/') ||
            id.includes('/src/components/controls/') ||
            id.includes('/src/components/viewport/')
          ) {
            return 'editor-runtime'
          }

          if (
            id.includes('/src/engine/storage.js') ||
            id.includes('/src/engine/projectTree.js') ||
            id.includes('/src/engine/portableSchema.js') ||
            id.includes('/src/engine/zipIO.js')
          ) {
            return 'workspace-core'
          }

          if (
            id.includes('/src/engine/github.js') ||
            id.includes('/src/engine/safetyScan.js') ||
            id.includes('/src/components/GitHubLoadDialog.jsx') ||
            id.includes('/src/components/GitHubSaveDialog.jsx') ||
            id.includes('/src/components/github/')
          ) {
            return 'github-tools'
          }

          if (
            id.includes('/src/components/VersionComparePanel.jsx') ||
            id.includes('/src/engine/versionCompare.js') ||
            id.includes('/src/engine/aiDebugger.js')
          ) {
            return 'analysis-tools'
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:8000',
      },
    },
  },
})
