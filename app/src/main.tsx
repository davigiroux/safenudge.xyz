// Polyfill Buffer before any Solana/Anchor imports
import { Buffer } from 'buffer'

declare global {
  var Buffer: typeof import('buffer').Buffer
}

globalThis.Buffer = Buffer

// Dynamic import ensures all Solana libs see Buffer globally
import('./bootstrap')
