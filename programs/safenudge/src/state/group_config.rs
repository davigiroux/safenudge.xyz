use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct GroupConfig {
    /// Human-readable group code, used as PDA seed
    #[max_len(32)]
    pub group_code: String,
    /// Group creator wallet — can start_cycle and emergency_cancel
    pub creator: Pubkey,
    /// USDC mint address
    pub mint: Pubkey,
    /// Fixed deposit amount per period (token smallest unit)
    pub deposit_amount: u64,
    /// 0 = weekly, 1 = biweekly, 2 = monthly
    pub frequency: u8,
    /// Number of deposit periods in the cycle (1-52)
    pub total_periods: u8,
    /// Max group size (2-10)
    pub max_members: u8,
    /// Current member count
    pub current_members: u8,
    /// 0 = fixed amount, 1 = percentage (basis points)
    pub penalty_type: u8,
    /// Penalty value: fixed amount in token units, or basis points (500 = 5%)
    pub penalty_value: u64,
    /// 0 = Open, 1 = Active, 2 = Completed, 3 = Cancelled
    pub status: u8,
    /// Unix timestamp when cycle started
    pub cycle_start: i64,
    /// Current period number (0-indexed)
    pub current_period: u8,
    /// PDA bump for group_config
    pub bump: u8,
}

/// Status constants
pub const STATUS_OPEN: u8 = 0;
pub const STATUS_ACTIVE: u8 = 1;
pub const STATUS_COMPLETED: u8 = 2;
pub const STATUS_CANCELLED: u8 = 3;
