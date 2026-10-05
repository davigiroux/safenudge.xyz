import idl from '../idl/safenudge.json'

const PRIMITIVE_BYTES: Record<string, number> = {
  bool: 1, u8: 1, i8: 1, u16: 2, i16: 2, u32: 4, i32: 4, u64: 8, i64: 8, u128: 16, i128: 16, pubkey: 32,
}

function fixedByteSize(type: unknown): number | null {
  if (typeof type === 'string') return PRIMITIVE_BYTES[type] ?? null
  if (typeof type === 'object' && type !== null && 'array' in type) {
    const [element, length] = type.array as [unknown, number]
    const elementSize = fixedByteSize(element)
    return elementSize === null ? null : elementSize * length
  }
  return null
}

/**
 * Byte offset of a field inside an account's data, read from the IDL. Throws when the
 * field has no fixed offset.
 */
export function fixedOffset(accountName: string, fieldName: string): number {
  const account = idl.accounts.find((a) => a.name === accountName)
  const layout = idl.types.find((t) => t.name === accountName)
  if (!account || !layout) throw new Error(`IDL has no account ${accountName}`)

  let offset = account.discriminator.length
  for (const field of layout.type.fields) {
    if (field.name === fieldName) return offset
    const size = fixedByteSize(field.type)
    if (size === null) {
      throw new Error(`${accountName}.${fieldName} has no fixed offset: ${field.name} before it has a variable size`)
    }
    offset += size
  }
  throw new Error(`IDL account ${accountName} has no field ${fieldName}`)
}
