//! PDA checks generated for `seeds = [...]` constraints.

use pinocchio::Address;

use crate::error::ErrorCode;
use crate::Result;

/// Most seeds a PDA takes, bump included.
pub const MAX_SEEDS: usize = 16;

/// Turns one `seeds = [...]` entry into bytes. Accepts anything Anchor's seeds accept that is
/// `AsRef<[u8]>`: byte strings, slices, addresses.
#[doc(hidden)]
#[inline(always)]
pub fn seed<T: AsRef<[u8]> + ?Sized>(value: &T) -> &[u8] {
    value.as_ref()
}

/// Checks `expected` is the PDA of `seeds` plus `bump`. One `sol_create_program_address`
/// syscall, as Anchor's `seeds` + `bump = <stored bump>`.
#[inline(always)]
pub fn verify_with_bump(
    seeds: &[&[u8]],
    bump: u8,
    program_id: &Address,
    expected: &Address,
) -> Result<()> {
    let bump = [bump];
    let mut with_bump: [&[u8]; MAX_SEEDS] = [&[]; MAX_SEEDS];
    let n = seeds.len();
    if n >= MAX_SEEDS {
        return Err(ErrorCode::ConstraintSeeds.into());
    }
    with_bump[..n].copy_from_slice(seeds);
    with_bump[n] = &bump;
    match Address::create_program_address(&with_bump[..=n], program_id) {
        Ok(derived) if derived == *expected => Ok(()),
        _ => Err(ErrorCode::ConstraintSeeds.into()),
    }
}

/// Checks `expected` is the canonical PDA of `seeds` and returns its bump. Searches bumps from
/// 255 down, as Anchor's bare `bump`, so it costs one syscall per bump tried. Prefer storing the
/// bump and using [`verify_with_bump`].
#[inline(always)]
pub fn verify_canonical(seeds: &[&[u8]], program_id: &Address, expected: &Address) -> Result<u8> {
    match Address::try_find_program_address(seeds, program_id) {
        Some((derived, bump)) if derived == *expected => Ok(bump),
        _ => Err(ErrorCode::ConstraintSeeds.into()),
    }
}
