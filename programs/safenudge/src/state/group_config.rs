use anchor_lang::prelude::*;

use crate::errors::SafeNudgeError;

/// One savings group. Never closed.
///
/// Every fixed-size field comes before `group_code`, the only variable-length one, so each field
/// above it sits at the same byte offset in every group and clients can `memcmp`-filter on it.
#[account(discriminator = b"snGroup2")]
#[derive(InitSpace)]
pub struct GroupConfig {
    /// Offset 8. Group creator wallet: can start_cycle and emergency_cancel.
    pub creator: Pubkey,
    /// Offset 40. Paid the rent of this account and of the vault at create_group. The only
    /// destination of the vault rent refund. Equals `creator` when the creator paid.
    pub rent_payer: Pubkey,
    /// Offset 72. USDC mint address.
    pub mint: Pubkey,
    /// Offset 104. Fixed deposit amount per period (token smallest unit).
    pub deposit_amount: u64,
    /// Offset 112. Penalty value: fixed amount in token units, or basis points (500 = 5%).
    pub penalty_value: u64,
    /// Offset 120. Unix timestamp when the cycle started; 0 while Open.
    pub cycle_start: i64,
    /// Offset 128. Unix timestamp of distribute or emergency_cancel; 0 until then.
    pub settled_at: i64,
    /// Offset 136. 0 = weekly, 1 = biweekly, 2 = monthly.
    pub frequency: u8,
    /// Offset 137. Number of deposit periods in the cycle (1-52).
    pub total_periods: u8,
    /// Offset 138. Max group size (2-10).
    pub max_members: u8,
    /// Offset 139. Members with a seat.
    pub current_members: u8,
    /// Offset 140. 0 = fixed amount, 1 = percentage (basis points).
    pub penalty_type: u8,
    /// Offset 141. 0 = Open, 1 = Active, 2 = Completed, 3 = Cancelled.
    pub status: u8,
    /// Offset 142. PDA bump for group_config.
    pub bump: u8,
    /// Offset 143. Human-readable group code, used as PDA seed.
    #[max_len(32)]
    pub group_code: String,
}

const _: () = assert!(8 + GroupConfig::INIT_SPACE == 179);

impl GroupConfig {
    /// First unix timestamp after the last deposit period of the cycle.
    pub fn cycle_end(&self) -> Result<i64> {
        let cycle_duration = i64::from(self.total_periods)
            .checked_mul(period_duration_secs(self.frequency)?)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        self.cycle_start
            .checked_add(cycle_duration)
            .ok_or(SafeNudgeError::ArithmeticOverflow.into())
    }
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
/// Devnet builds accept code 3, five minutes, so a full lifecycle can be driven through the app
/// in one sitting instead of a fortnight. Five is near the floor: a period still has to be long
/// enough for two people to tap through a deposit on their phones. The arm is compiled out of any other build, so a mainnet
/// binary has no such code to reach and `create_group` rejects it through `MAX_FREQUENCY`.
pub fn period_duration_secs(frequency: u8) -> Result<i64> {
    const DAY: i64 = 86_400;
    let secs = match frequency {
        0 => 7_i64.checked_mul(DAY),
        1 => 14_i64.checked_mul(DAY),
        2 => 30_i64.checked_mul(DAY),
        #[cfg(feature = "devnet")]
        3 => Some(300),
        _ => return Err(SafeNudgeError::InvalidFrequency.into()),
    };
    secs.ok_or(SafeNudgeError::ArithmeticOverflow.into())
}

/// Seconds a member record stays open after its group settles. Clients read the records of a
/// settled group to show each member's result, so `close_member_record` waits this long.
/// Devnet builds wait five minutes so the close path can be driven in one sitting.
pub const RECORD_RETENTION_SECS: i64 = if cfg!(feature = "devnet") { 300 } else { 2_592_000 };

/// First unix timestamp at which the records of a group settled at `settled_at` can close.
pub fn record_retention_end(settled_at: i64) -> Result<i64> {
    settled_at
        .checked_add(RECORD_RETENTION_SECS)
        .ok_or(SafeNudgeError::ArithmeticOverflow.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn record_retention_is_30_days_except_in_devnet_builds() {
        let expected = if cfg!(feature = "devnet") { 300 } else { 2_592_000 };
        assert_eq!(RECORD_RETENTION_SECS, expected);
        assert_eq!(record_retention_end(1_000).unwrap(), 1_000 + expected);
    }

    #[test]
    fn record_retention_end_rejects_a_timestamp_that_overflows() {
        assert!(record_retention_end(i64::MAX).is_err());
    }

    #[test]
    fn cycle_end_adds_every_period_to_the_cycle_start() {
        let mut group = GroupConfig {
            creator: Pubkey::default(),
            rent_payer: Pubkey::default(),
            mint: Pubkey::default(),
            deposit_amount: 0,
            penalty_value: 0,
            cycle_start: 1_000,
            settled_at: 0,
            frequency: 0,
            total_periods: 4,
            max_members: 0,
            current_members: 0,
            penalty_type: 0,
            status: 0,
            bump: 0,
            group_code: String::new(),
        };
        assert_eq!(group.cycle_end().unwrap(), 1_000 + 4 * 604_800);
        group.cycle_start = i64::MAX;
        assert!(group.cycle_end().is_err());
    }

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
            assert_eq!(period_duration_secs(3).unwrap(), 300);
            assert_eq!(MAX_FREQUENCY, 3);
        } else {
            assert!(period_duration_secs(3).is_err());
            assert_eq!(MAX_FREQUENCY, 2);
        }
    }

    #[test]
    fn serializes_group_config_fields_at_the_documented_offsets() {
        let group = GroupConfig {
            creator: Pubkey::new_from_array([1; 32]),
            rent_payer: Pubkey::new_from_array([2; 32]),
            mint: Pubkey::new_from_array([3; 32]),
            deposit_amount: 0x0404_0404_0404_0404,
            penalty_value: 0x0505_0505_0505_0505,
            cycle_start: 0x0606_0606_0606_0606,
            settled_at: 0x0707_0707_0707_0707,
            frequency: 8,
            total_periods: 9,
            max_members: 10,
            current_members: 11,
            penalty_type: 12,
            status: 13,
            bump: 14,
            group_code: "abc".to_string(),
        };
        let mut bytes = Vec::new();
        group.try_serialize(&mut bytes).unwrap();

        assert_eq!(&bytes[0..8], b"snGroup2");
        assert_eq!(&bytes[8..40], &[1; 32]);
        assert_eq!(&bytes[40..72], &[2; 32]);
        assert_eq!(&bytes[72..104], &[3; 32]);
        assert_eq!(&bytes[104..112], &[4; 8]);
        assert_eq!(&bytes[112..120], &[5; 8]);
        assert_eq!(&bytes[120..128], &[6; 8]);
        assert_eq!(&bytes[128..136], &[7; 8]);
        assert_eq!(&bytes[136..143], &[8, 9, 10, 11, 12, 13, 14]);
        assert_eq!(&bytes[143..147], &3u32.to_le_bytes());
        assert_eq!(&bytes[147..], b"abc");
    }

    #[test]
    fn a_32_character_code_fills_the_allocated_size() {
        let group = GroupConfig {
            creator: Pubkey::default(),
            rent_payer: Pubkey::default(),
            mint: Pubkey::default(),
            deposit_amount: 0,
            penalty_value: 0,
            cycle_start: 0,
            settled_at: 0,
            frequency: 0,
            total_periods: 0,
            max_members: 0,
            current_members: 0,
            penalty_type: 0,
            status: 0,
            bump: 0,
            group_code: "a".repeat(32),
        };
        let mut bytes = Vec::new();
        group.try_serialize(&mut bytes).unwrap();
        assert_eq!(bytes.len(), 179);
    }
}

/// Status constants
pub const STATUS_OPEN: u8 = 0;
pub const STATUS_ACTIVE: u8 = 1;
pub const STATUS_COMPLETED: u8 = 2;
pub const STATUS_CANCELLED: u8 = 3;
