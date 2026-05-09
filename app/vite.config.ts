import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
//
// Vite 8 / Rolldown's dep optimizer bundles `.node.cjs` builds of several
// @solana/* packages and their transitive deps (elliptic, eventemitter3, etc.).
// Those CJS files reach for Node builtins via `require('events')`,
// `require('inherits')`, etc. Without explicit aliases the resulting bundle
// references a `require_<x>` that never gets a value, and the page crashes
// with `require_events is not a function` before React can mount. Aliasing
// each shim to its installed npm polyfill resolves the require() at bundle
// time. The `buffer` alias also keeps `globalThis.Buffer` available for
// Anchor (set explicitly in src/main.tsx).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      buffer: path.resolve(__dirname, 'node_modules/buffer/'),
      events: path.resolve(__dirname, 'node_modules/events/'),
      inherits: path.resolve(__dirname, 'node_modules/inherits/'),
    },
  },
  optimizeDeps: {
    include: ['buffer', 'events', 'inherits'],
  },
})
