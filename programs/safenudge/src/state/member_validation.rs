use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::errors::SafeNudgeError;
use crate::state::MemberRecord;

/// Validates a `[member_record, member_token_account]` pair from a permissionless
/// caller's `remaining_accounts`. Both `distribute` and `emergency_cancel` rely
/// on this check to prevent vault drain via forged records or substituted ATAs;
/// keep the two callsites in sync by going through this helper.
///
/// Returns the deserialized `MemberRecord` on success.
pub fn validate_member_pair<'info>(
    record_info: &'info AccountInfo<'info>,
    token_info: &'info AccountInfo<'info>,
    group_key: &Pubkey,
    mint_key: &Pubkey,
    seen_records: &mut Vec<Pubkey>,
) -> Result<MemberRecord> {
    require_keys_eq!(
        *record_info.owner,
        crate::ID,
        SafeNudgeError::InvalidAccountOwner
    );

    let data = record_info.try_borrow_data()?;
    let mut data_slice: &[u8] = &data;
    let member_record = MemberRecord::try_deserialize(&mut data_slice)
        .map_err(|_| SafeNudgeError::MemberCountMismatch)?;
    drop(data);

    require!(
        member_record.group == *group_key,
        SafeNudgeError::MemberCountMismatch
    );

    let (expected_record, _) = Pubkey::find_program_address(
        &[b"member", group_key.as_ref(), member_record.member.as_ref()],
        &crate::ID,
    );
    require_keys_eq!(
        *record_info.key,
        expected_record,
        SafeNudgeError::InvalidMemberRecord
    );

    require!(
        !seen_records.contains(record_info.key),
        SafeNudgeError::DuplicateMemberRecord
    );
    seen_records.push(*record_info.key);

    let token_account = InterfaceAccount::<TokenAccount>::try_from(token_info)?;
    require_keys_eq!(
        token_account.owner,
        member_record.member,
        SafeNudgeError::InvalidTokenAccountOwner
    );
    require_keys_eq!(token_account.mint, *mint_key, SafeNudgeError::InvalidMint);

    Ok(member_record)
}
