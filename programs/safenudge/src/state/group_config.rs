use anchor_lang::prelude::*;

use crate::errors::SafeNudgeError;

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
    /// PDA bump for group_config
    pub bump: u8,
}

/// Highest accepted `frequency` code. Devnet builds accept one more than mainnet; see
/// `period_duration_secs`.
pub const MAX_FREQUENCY: u8 = if cfg!(feature = "devnet") { 3 } else { 2 };

/// Seconds in one deposit period, by `frequency` code.
///
/// `deposit` and `distribute` both derive the cycle's end from this. They used to carry their
/// own copy of the table, which is a drift waiting to happen: a mismatch between them would let
/// a deposit land in a cycle `distribute` already considers over.
///
/// Devnet builds accept code 3, one hour, so a full lifecycle can be driven through the app in
/// an afternoon instead of a fortnight. The arm is compiled out of any other build, so a mainnet
/// binary has no such code to reach and `create_group` rejects it through `MAX_FREQUENCY`.
pub fn period_duration_secs(frequency: u8) -> Result<i64> {
    const DAY: i64 = 86_400;
    let secs = match frequency {
        0 => 7_i64.checked_mul(DAY),
        1 => 14_i64.checked_mul(DAY),
        2 => 30_i64.checked_mul(DAY),
        #[cfg(feature = "devnet")]
        3 => Some(3_600),
        _ => return Err(SafeNudgeError::InvalidFrequency.into()),
    };
    secs.ok_or(SafeNudgeError::ArithmeticOverflow.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_each_frequency_to_its_period() {
        assert_eq!(period_duration_secs(0).unwrap(), 604_800);
        assert_eq!(period_duration_secs(1).unwrap(), 1_209_600);
        assert_eq!(period_duration_secs(2).unwrap(), 2_592_000);
    }

    #[test]
    fn rejects_an_unknown_frequency() {
        assert!(period_duration_secs(4).is_err());
        assert!(period_duration_secs(u8::MAX).is_err());
    }

    #[test]
    fn frequency_3_exists_only_in_devnet_builds() {
        if cfg!(feature = "devnet") {
            assert_eq!(period_duration_secs(3).unwrap(), 3_600);
            assert_eq!(MAX_FREQUENCY, 3);
        } else {
            assert!(period_duration_secs(3).is_err());
            assert_eq!(MAX_FREQUENCY, 2);
        }
    }
}

/// Status constants
pub const STATUS_OPEN: u8 = 0;
pub const STATUS_ACTIVE: u8 = 1;
pub const STATUS_COMPLETED: u8 = 2;
pub const STATUS_CANCELLED: u8 = 3;
