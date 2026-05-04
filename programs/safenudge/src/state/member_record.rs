use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct MemberRecord {
    /// Reference to the GroupConfig PDA
    pub group: Pubkey,
    /// Member's wallet address
    pub member: Pubkey,
    /// Total tokens deposited across all periods
    pub total_deposited: u64,
    /// Number of on-time deposits made (including initial)
    pub deposits_made: u8,
    /// Per-period deposit tracking (max 52 periods)
    pub periods_deposited: [bool; 52],
    /// PDA bump for member_record
    pub bump: u8,
}
