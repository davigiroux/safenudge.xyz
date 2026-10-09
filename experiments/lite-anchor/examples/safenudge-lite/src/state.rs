//! The two accounts `deposit` reads, laid out byte for byte as the Anchor program writes them.

use lite_anchor::prelude::*;
use lite_anchor::zero_copy::AccountData;

use crate::errors::SafeNudgeError;

/// One savings group. Offsets are those documented in `programs/safenudge/src/state/group_config.rs`.
#[account(discriminator = b"snGroup2")]
pub struct GroupConfig {
    /// Offset 8.
    pub creator: Address,
    /// Offset 40.
    pub rent_payer: Address,
    /// Offset 72.
    pub mint: Address,
    /// Offset 104.
    pub deposit_amount: u64,
    /// Offset 112.
    pub penalty_value: u64,
    /// Offset 120. 0 while Open.
    pub cycle_start: i64,
    /// Offset 128.
    pub settled_at: i64,
    /// Offset 136. 0 = weekly, 1 = biweekly, 2 = monthly.
    pub frequency: u8,
    /// Offset 137.
    pub total_periods: u8,
    /// Offset 138.
    pub max_members: u8,
    /// Offset 139.
    pub current_members: u8,
    /// Offset 140.
    pub penalty_type: u8,
    /// Offset 141. 0 = Open, 1 = Active, 2 = Completed, 3 = Cancelled.
    pub status: u8,
    /// Offset 142.
    pub bump: u8,
    /// Offset 143. Length prefix of the Borsh `String` the Anchor program stores.
    pub group_code_len: u32,
    /// Offset 147. The code's bytes, zero-padded to the 32 the account is allocated for.
    pub group_code: [u8; 32],
}

const _: () = assert!(<GroupConfig as AccountData>::SPACE == 179);

impl GroupConfig {
    /// The group code, the `group_config` PDA seed. A length prefix past the allocation is an
    /// account Anchor would fail to deserialize, so it fails the same way.
    pub fn group_code(&self) -> Result<&[u8]> {
        let len = usize::try_from(self.group_code_len)
            .map_err(|_| ProgramError::from(ErrorCode::AccountDidNotDeserialize))?;
        self.group_code
            .get(..len)
            .ok_or_else(|| ErrorCode::AccountDidNotDeserialize.into())
    }

    /// First unix timestamp after the last deposit period of the cycle.
    pub fn cycle_end(&self) -> Result<i64> {
        let cycle_duration = i64::from(self.total_periods)
            .checked_mul(period_duration_secs(self.frequency)?)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        self.cycle_start
            .checked_add(cycle_duration)
            .ok_or_else(|| SafeNudgeError::ArithmeticOverflow.into())
    }
}

/// One member's participation in one group.
#[account(discriminator = b"snMembr2")]
pub struct MemberRecord {
    /// Offset 8.
    pub group: Address,
    /// Offset 40.
    pub member: Address,
    /// Offset 72.
    pub rent_payer: Address,
    /// Offset 104.
    pub total_deposited: u64,
    /// Offset 112.
    pub deposits_made: u8,
    /// Offset 113. One byte per period, 1 once deposited. A Borsh `bool` in the Anchor program.
    pub periods_deposited: [u8; 52],
    /// Offset 165.
    pub bump: u8,
}

const _: () = assert!(<MemberRecord as AccountData>::SPACE == 166);

pub const STATUS_ACTIVE: u8 = 1;

/// Seconds in one deposit period, by `frequency` code. Same table as `programs/safenudge`.
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
    secs.ok_or_else(|| SafeNudgeError::ArithmeticOverflow.into())
}
