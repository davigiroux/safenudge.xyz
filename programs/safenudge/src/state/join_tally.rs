use anchor_lang::prelude::*;

/// Counts the joins of one member at one group address, across `leave_group`.
///
/// Lives at PDA `["tally", group_config, member]`. `join_group` creates it at the first join and
/// adds one at every join. `leave_group` and `close_member_record` never touch it, and it outlives
/// `close_group`. Only `close_join_tally` closes it, once no group lives at its group address.
/// The address names the group and the member, so the account stores neither.
#[account(discriminator = b"snTally1")]
#[derive(InitSpace)]
pub struct JoinTally {
    /// Offset 8. Paid this account's rent at the first join_group. The only destination of that
    /// rent when the tally is closed. A later join never rewrites it.
    pub rent_payer: Pubkey,
    /// Offset 40. Successful join_group calls of this member at this group address. Never zero
    /// on a stored tally: the join that creates the account also counts itself.
    pub joins: u32,
}

const _: () = assert!(8 + JoinTally::INIT_SPACE == 44);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_join_tally_fields_at_the_documented_offsets() {
        let tally = JoinTally {
            rent_payer: Pubkey::new_from_array([3; 32]),
            joins: 0x0102_0304,
        };
        let mut bytes = Vec::new();
        tally.try_serialize(&mut bytes).unwrap();

        assert_eq!(bytes.len(), 44);
        assert_eq!(&bytes[0..8], b"snTally1");
        assert_eq!(&bytes[8..40], &[3; 32]);
        assert_eq!(&bytes[40..44], &[4, 3, 2, 1]);
    }
}
