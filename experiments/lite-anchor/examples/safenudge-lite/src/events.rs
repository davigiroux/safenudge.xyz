use lite_anchor::prelude::*;

/// A member deposited for a period. Same name and fields as `programs/safenudge`, so the log
/// line is byte-identical and existing decoders read it.
#[event]
pub struct DepositMade {
    pub group: Address,
    pub member: Address,
    /// Zero-based period index.
    pub period: u8,
    pub amount: u64,
    /// Deposits after this one, the join deposit included.
    pub deposits_made: u8,
}
