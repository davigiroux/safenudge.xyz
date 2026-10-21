use anchor_lang::prelude::*;

use crate::errors::SafeNudgeError;
use crate::events::MemberSettled;
use crate::state::GroupTerms;

/// What settlement reads from one member record.
#[derive(Clone, Copy, Debug)]
pub struct MemberDeposits {
    pub member: Pubkey,
    pub total_deposited: u64,
    pub deposits_made: u8,
}

/// The outcome of `distribute` before any token moves.
pub struct Settlement {
    /// One row per member, in input order.
    pub members: Vec<MemberSettled>,
    pub protocol_fee: u64,
    pub compliant_count: u8,
    /// Sum of `total_deposited`. The vault must hold at least this much.
    pub total_deposited: u64,
}

/// Computes every member's penalty and payout and the protocol fee.
///
/// Fails with `SettlementImbalance` unless the payouts and the fee add up to the deposits, less
/// the rounding dust of splitting the penalty pool, which stays in the vault for the last member.
pub fn settle(
    group: Pubkey,
    terms: &GroupTerms,
    deposits: &[MemberDeposits],
    fee_bps: u64,
) -> Result<Settlement> {
    let mut penalties: Vec<(u64, bool)> = Vec::with_capacity(deposits.len());
    let mut total_penalties: u64 = 0;
    let mut total_deposited: u64 = 0;
    let mut compliant_count: u64 = 0;

    for d in deposits {
        let missed = u64::from(terms.total_periods)
            .checked_sub(u64::from(d.deposits_made))
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        let penalty = penalty(terms, missed, d.total_deposited)?;
        if missed == 0 {
            compliant_count = compliant_count
                .checked_add(1)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        }
        total_penalties = total_penalties
            .checked_add(penalty)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        total_deposited = total_deposited
            .checked_add(d.total_deposited)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        penalties.push((penalty, missed == 0));
    }

    // With no compliant member every deposit returns and no penalty is charged, so there is no
    // pool to take a fee from.
    let protocol_fee = if compliant_count == 0 {
        0
    } else {
        total_penalties
            .checked_mul(fee_bps)
            .and_then(|x| x.checked_div(10_000))
            .ok_or(SafeNudgeError::ArithmeticOverflow)?
    };
    let bonus_per_compliant = if compliant_count == 0 {
        0
    } else {
        total_penalties
            .checked_sub(protocol_fee)
            .and_then(|x| x.checked_div(compliant_count))
            .ok_or(SafeNudgeError::ArithmeticOverflow)?
    };

    let mut members: Vec<MemberSettled> = Vec::with_capacity(deposits.len());
    let mut total_out = protocol_fee;
    for (d, &(member_penalty, is_compliant)) in deposits.iter().zip(&penalties) {
        let (penalty, payout) = if compliant_count == 0 {
            (0, d.total_deposited)
        } else {
            let base = d
                .total_deposited
                .checked_sub(member_penalty)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;
            let bonus = if is_compliant { bonus_per_compliant } else { 0 };
            let payout = base
                .checked_add(bonus)
                .ok_or(SafeNudgeError::ArithmeticOverflow)?;
            (member_penalty, payout)
        };
        total_out = total_out
            .checked_add(payout)
            .ok_or(SafeNudgeError::ArithmeticOverflow)?;
        members.push(MemberSettled {
            group,
            member: d.member,
            deposited: d.total_deposited,
            penalty,
            payout,
        });
    }

    let dust = total_deposited
        .checked_sub(total_out)
        .ok_or(SafeNudgeError::SettlementImbalance)?;
    require!(
        dust < compliant_count.max(1),
        SafeNudgeError::SettlementImbalance
    );

    Ok(Settlement {
        members,
        protocol_fee,
        compliant_count: u8::try_from(compliant_count)
            .map_err(|_| SafeNudgeError::ArithmeticOverflow)?,
        total_deposited,
    })
}

/// The penalty for `missed` periods, capped at what the member deposited.
///
/// Computed in u128 so no admissible input can overflow before the cap (issue #44 H-1): missed
/// is at most 52 and every factor is a u64. The percentage form multiplies before it divides, so
/// it rounds once, down, in the member's favour.
fn penalty(terms: &GroupTerms, missed: u64, total_deposited: u64) -> Result<u64> {
    let raw: u128 = match terms.penalty_type {
        0 => u128::from(missed)
            .checked_mul(u128::from(terms.penalty_value))
            .ok_or(SafeNudgeError::ArithmeticOverflow)?,
        1 => u128::from(missed)
            .checked_mul(u128::from(terms.deposit_amount))
            .and_then(|x| x.checked_mul(u128::from(terms.penalty_value)))
            .and_then(|x| x.checked_div(10_000))
            .ok_or(SafeNudgeError::ArithmeticOverflow)?,
        _ => return Err(SafeNudgeError::InvalidPenaltyConfig.into()),
    };
    u64::try_from(raw.min(u128::from(total_deposited)))
        .map_err(|_| SafeNudgeError::ArithmeticOverflow.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn terms(penalty_type: u8, penalty_value: u64) -> GroupTerms {
        GroupTerms {
            creator: Pubkey::default(),
            deposit_amount: 1_000_000,
            frequency: 0,
            total_periods: 4,
            penalty_type,
            penalty_value,
        }
    }

    fn member(deposits_made: u8) -> MemberDeposits {
        MemberDeposits {
            member: Pubkey::new_unique(),
            total_deposited: u64::from(deposits_made) * 1_000_000,
            deposits_made,
        }
    }

    fn total_out(s: &Settlement) -> u64 {
        s.members.iter().map(|m| m.payout).sum::<u64>() + s.protocol_fee
    }

    #[test]
    fn everyone_compliant_gets_their_deposits_back() {
        let s = settle(
            Pubkey::default(),
            &terms(0, 500_000),
            &[member(4), member(4)],
            500,
        )
        .unwrap();
        assert_eq!(s.protocol_fee, 0);
        assert!(s
            .members
            .iter()
            .all(|m| m.payout == 4_000_000 && m.penalty == 0));
    }

    #[test]
    fn a_fixed_penalty_pays_the_fee_and_the_compliant_member() {
        // Missed 3 of 4 at 500,000 each: 1,500,000 capped at the 1,000,000 deposited.
        let s = settle(
            Pubkey::default(),
            &terms(0, 500_000),
            &[member(4), member(1)],
            500,
        )
        .unwrap();
        assert_eq!(s.members[1].penalty, 1_000_000);
        assert_eq!(s.members[1].payout, 0);
        assert_eq!(s.protocol_fee, 50_000);
        assert_eq!(s.members[0].payout, 4_950_000);
        assert_eq!(total_out(&s), s.total_deposited);
    }

    #[test]
    fn a_percentage_penalty_rounds_once() {
        // 3 missed periods at 33.33% of 1,000,003 is 999,902.9997, so 999,902. Rounding each
        // period first would give 3 * 333,300 = 999,900.
        let t = GroupTerms {
            deposit_amount: 1_000_003,
            ..terms(1, 3333)
        };
        let late = MemberDeposits {
            member: Pubkey::new_unique(),
            total_deposited: 1_000_003,
            deposits_made: 1,
        };
        let on_time = MemberDeposits {
            member: Pubkey::new_unique(),
            total_deposited: 4_000_012,
            deposits_made: 4,
        };
        let s = settle(Pubkey::default(), &t, &[on_time, late], 0).unwrap();
        assert_eq!(s.members[1].penalty, 999_902);
    }

    #[test]
    fn a_zero_penalty_refunds_every_deposit_and_charges_no_fee() {
        let s = settle(
            Pubkey::default(),
            &terms(0, 0),
            &[member(4), member(2), member(1)],
            500,
        )
        .unwrap();
        assert_eq!(s.protocol_fee, 0);
        for m in &s.members {
            assert_eq!(m.penalty, 0);
            assert_eq!(m.payout, m.deposited);
        }
    }

    #[test]
    fn with_no_compliant_member_everyone_is_refunded_without_a_fee() {
        let s = settle(
            Pubkey::default(),
            &terms(0, 500_000),
            &[member(2), member(1)],
            500,
        )
        .unwrap();
        assert_eq!(s.protocol_fee, 0);
        assert_eq!(s.members[0].payout, 2_000_000);
        assert_eq!(s.members[1].payout, 1_000_000);
    }

    #[test]
    fn payouts_and_fee_never_exceed_deposits_and_leave_less_dust_than_compliant_members() {
        for penalty_type in 0..=1u8 {
            for penalty_value in [0, 1, 333, 3_333, 5_000, 999_999, 1_000_000] {
                for made in [[4, 4, 4], [4, 1, 1], [4, 4, 3], [1, 2, 3], [4, 3, 2]] {
                    for fee_bps in [0, 500] {
                        let group: Vec<_> = made.iter().map(|&m| member(m)).collect();
                        let s = settle(
                            Pubkey::default(),
                            &terms(penalty_type, penalty_value),
                            &group,
                            fee_bps,
                        )
                        .unwrap();
                        let dust = s.total_deposited - total_out(&s);
                        assert!(dust < u64::from(s.compliant_count.max(1)));
                    }
                }
            }
        }
    }

    #[test]
    fn rejects_more_deposits_than_periods() {
        assert!(settle(
            Pubkey::default(),
            &terms(0, 1),
            &[member(5), member(4)],
            500
        )
        .is_err());
    }
}
