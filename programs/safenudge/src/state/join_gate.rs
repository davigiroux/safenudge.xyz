use anchor_lang::prelude::*;

/// Makes `join_group` of one group require the signature of `authority`.
///
/// Lives at PDA `["join", group_config]`. `set_join_authority` creates it and `close_group`
/// closes it, so it never outlives its group.
#[account(discriminator = b"snJoinG1")]
#[derive(InitSpace)]
pub struct JoinGate {
    /// Offset 8. The GroupConfig PDA this gate belongs to.
    pub group: Pubkey,
    /// Offset 40. Must sign every join_group of the group.
    pub authority: Pubkey,
    /// Offset 72. PDA bump for join_gate.
    pub bump: u8,
}

const _: () = assert!(8 + JoinGate::INIT_SPACE == 73);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_join_gate_fields_at_the_documented_offsets() {
        let gate = JoinGate {
            group: Pubkey::new_from_array([1; 32]),
            authority: Pubkey::new_from_array([2; 32]),
            bump: 3,
        };
        let mut bytes = Vec::new();
        gate.try_serialize(&mut bytes).unwrap();

        assert_eq!(bytes.len(), 73);
        assert_eq!(&bytes[0..8], b"snJoinG1");
        assert_eq!(&bytes[8..40], &[1; 32]);
        assert_eq!(&bytes[40..72], &[2; 32]);
        assert_eq!(bytes[72], 3);
    }
}
