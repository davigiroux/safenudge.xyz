//! Events written to the transaction log with `emit!`. Each handler emits after its last
//! mutation and CPI, so a failed transaction carries none. Amounts are raw token units. Fields
//! stay flat: log indexers cannot address array elements or nested structs.

use anchor_lang::prelude::*;

/// A group was created by `create_group`.
#[event]
pub struct GroupCreated {
    pub group: Pubkey,
    pub creator: Pubkey,
    pub rent_payer: Pubkey,
    pub mint: Pubkey,
    pub deposit_amount: u64,
    pub total_periods: u8,
    pub max_members: u8,
}

/// A member joined with the first deposit.
#[event]
pub struct MemberJoined {
    pub group: Pubkey,
    pub member: Pubkey,
    pub rent_payer: Pubkey,
    /// First deposit moved into the vault.
    pub amount: u64,
    /// Members after this join.
    pub current_members: u8,
}

/// A member left an Open group and got the recorded deposit back.
#[event]
pub struct MemberLeft {
    pub group: Pubkey,
    pub member: Pubkey,
    pub refund: u64,
    /// Members after this leave.
    pub current_members: u8,
}

/// The creator started the cycle.
#[event]
pub struct CycleStarted {
    pub group: Pubkey,
    pub members: u8,
    pub cycle_start: i64,
    /// First timestamp at which `distribute` accepts the group.
    pub cycle_end: i64,
}

/// A member deposited for a period.
#[event]
pub struct DepositMade {
    pub group: Pubkey,
    pub member: Pubkey,
    /// Zero-based period index.
    pub period: u8,
    pub amount: u64,
    /// Deposits after this one, the join deposit included.
    pub deposits_made: u8,
}

/// One member's result of `distribute`.
#[event]
pub struct MemberSettled {
    pub group: Pubkey,
    pub member: Pubkey,
    pub deposited: u64,
    /// Penalty charged. Zero when no member was compliant, because all deposits then return.
    pub penalty: u64,
    /// Tokens sent to the member. The last member also gets the rounding remainder.
    pub payout: u64,
}

/// `distribute` settled the group and closed the vault.
#[event]
pub struct GroupSettled {
    pub group: Pubkey,
    pub members: u8,
    pub compliant_count: u8,
    /// Sum of `MemberSettled.penalty`.
    pub total_penalties: u64,
    pub protocol_fee: u64,
    /// Sum of `MemberSettled.payout`. Plus `protocol_fee`, equals the vault balance before
    /// settlement.
    pub total_paid: u64,
}

/// The creator cancelled the group and the vault closed.
#[event]
pub struct GroupCancelled {
    pub group: Pubkey,
    pub creator: Pubkey,
    pub members: u8,
    /// Tokens sent to members.
    pub refunded_total: u64,
    /// Tokens burned from the vault of a group with no members. Zero otherwise.
    pub burned: u64,
}

/// The fee recipient withdrew the treasury balance of one mint.
#[event]
pub struct FeesWithdrawn {
    pub recipient: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}
