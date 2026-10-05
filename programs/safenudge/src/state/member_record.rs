use anchor_lang::prelude::*;

/// One member's participation in one group. Closed by `close_member_record` once the group is
/// Completed or Cancelled; its rent goes to `rent_payer`.
#[account(discriminator = b"snMembr2")]
#[derive(InitSpace)]
pub struct MemberRecord {
    /// Offset 8. Reference to the GroupConfig PDA.
    pub group: Pubkey,
    /// Offset 40. Member's wallet address.
    pub member: Pubkey,
    /// Offset 72. Paid this record's rent at join_group. The only destination of that rent when
    /// the record is closed. Equals `member` when the member paid.
    pub rent_payer: Pubkey,
    /// Offset 104. Total tokens deposited across all periods.
    pub total_deposited: u64,
    /// Offset 112. Number of on-time deposits made (including initial).
    pub deposits_made: u8,
    /// Offset 113. Per-period deposit tracking (max 52 periods).
    pub periods_deposited: [bool; 52],
    /// Offset 165. PDA bump for member_record.
    pub bump: u8,
}

const _: () = assert!(8 + MemberRecord::INIT_SPACE == 166);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_member_record_fields_at_the_documented_offsets() {
        let mut periods_deposited = [false; 52];
        periods_deposited[0] = true;
        periods_deposited[51] = true;
        let record = MemberRecord {
            group: Pubkey::new_from_array([1; 32]),
            member: Pubkey::new_from_array([2; 32]),
            rent_payer: Pubkey::new_from_array([3; 32]),
            total_deposited: 0x0404_0404_0404_0404,
            deposits_made: 5,
            periods_deposited,
            bump: 6,
        };
        let mut bytes = Vec::new();
        record.try_serialize(&mut bytes).unwrap();

        assert_eq!(bytes.len(), 166);
        assert_eq!(&bytes[0..8], b"snMembr2");
        assert_eq!(&bytes[8..40], &[1; 32]);
        assert_eq!(&bytes[40..72], &[2; 32]);
        assert_eq!(&bytes[72..104], &[3; 32]);
        assert_eq!(&bytes[104..112], &[4; 8]);
        assert_eq!(bytes[112], 5);
        assert_eq!(bytes[113], 1);
        assert_eq!(bytes[164], 1);
        assert_eq!(bytes[165], 6);
    }
}
