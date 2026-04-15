import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Force Vite to bundle the browser 'buffer' polyfill instead of externalizing it
      buffer: path.resolve(__dirname, 'node_modules/buffer/'),
    },
  },
  optimizeDeps: {
    include: ['buffer'],
  },
})
