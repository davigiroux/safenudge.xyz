use anchor_lang::prelude::*;

/// Makes `join_group` of one group require the signature of `authority`.
///
/// Lives at PDA `["join", group_config]`. `set_join_authority` creates it and `close_group`
/// closes it, so it never outlives its group. The address names the group, so the account
/// stores only the authority.
#[account(discriminator = b"snJoinG1")]
#[derive(InitSpace)]
pub struct JoinGate {
    /// Offset 8. Must sign every join_group of the group.
    pub authority: Pubkey,
}

const _: () = assert!(8 + JoinGate::INIT_SPACE == 40);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_join_gate_fields_at_the_documented_offsets() {
        let gate = JoinGate {
            authority: Pubkey::new_from_array([2; 32]),
        };
        let mut bytes = Vec::new();
        gate.try_serialize(&mut bytes).unwrap();

        assert_eq!(bytes.len(), 40);
        assert_eq!(&bytes[0..8], b"snJoinG1");
        assert_eq!(&bytes[8..40], &[2; 32]);
    }
}
