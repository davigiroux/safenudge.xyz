// Polyfill Buffer before any Solana/Anchor imports
import { Buffer } from 'buffer'
globalThis.Buffer = Buffer

// Dynamic import ensures all Solana libs see Buffer globally
import('./bootstrap')
