use anchor_lang::prelude::*;
use anchor_spl::token::spl_token;
use anchor_spl::token_2022::spl_token_2022::{
    self,
    extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions},
    state::Mint as Token2022Mint,
};

use crate::errors::SafeNudgeError;

/// True when every extension is on the allowlist.
pub fn extensions_supported(extensions: &[ExtensionType]) -> bool {
    extensions.iter().all(|extension| {
        matches!(
            extension,
            ExtensionType::MetadataPointer
                | ExtensionType::TokenMetadata
                | ExtensionType::InterestBearingConfig
        )
    })
}

/// The extension types of a Token-2022 mint, or `None` when the data holds a type this build
/// does not know.
pub fn token_2022_mint_extensions(mint_data: &[u8]) -> Option<Vec<ExtensionType>> {
    StateWithExtensions::<Token2022Mint>::unpack(mint_data)
        .and_then(|mint| mint.get_extension_types())
        .ok()
}

/// Fails with `UnsupportedMint` for a native mint and for a Token-2022 mint outside the
/// extension allowlist.
pub fn require_supported_mint(mint: &AccountInfo) -> Result<()> {
    let key = mint.key();
    require!(
        key != spl_token::native_mint::ID && key != spl_token_2022::native_mint::ID,
        SafeNudgeError::UnsupportedMint
    );

    if *mint.owner == spl_token_2022::ID {
        let data = mint.try_borrow_data()?;
        let extensions =
            token_2022_mint_extensions(&data).ok_or(SafeNudgeError::UnsupportedMint)?;
        require!(
            extensions_supported(&extensions),
            SafeNudgeError::UnsupportedMint
        );
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::solana_program::program_pack::Pack;
    use anchor_spl::token_2022::spl_token_2022::extension::AccountType;
    use anchor_spl::token_2022::spl_token_2022::state::Account as Token2022Account;

    const MINT_ACCOUNT_TYPE_OFFSET: usize = Token2022Account::LEN;

    fn mint_data_with_extension_type(extension_type: u16) -> Vec<u8> {
        let mut data = vec![0u8; MINT_ACCOUNT_TYPE_OFFSET + 1 + 4];
        let mint = Token2022Mint {
            is_initialized: true,
            decimals: 6,
            ..Token2022Mint::default()
        };
        Token2022Mint::pack(mint, &mut data[..Token2022Mint::LEN]).unwrap();
        data[MINT_ACCOUNT_TYPE_OFFSET] = AccountType::Mint as u8;
        data[MINT_ACCOUNT_TYPE_OFFSET + 1..MINT_ACCOUNT_TYPE_OFFSET + 3]
            .copy_from_slice(&extension_type.to_le_bytes());
        data
    }

    #[test]
    fn accepts_a_mint_with_no_extension() {
        assert!(extensions_supported(&[]));
    }

    #[test]
    fn accepts_metadata_and_interest_bearing_together() {
        assert!(extensions_supported(&[
            ExtensionType::MetadataPointer,
            ExtensionType::TokenMetadata,
            ExtensionType::InterestBearingConfig,
        ]));
    }

    #[test]
    fn rejects_extensions_that_change_what_a_transfer_delivers() {
        assert!(!extensions_supported(&[ExtensionType::TransferFeeConfig]));
        assert!(!extensions_supported(&[ExtensionType::TransferHook]));
        assert!(!extensions_supported(&[ExtensionType::NonTransferable]));
        assert!(!extensions_supported(&[ExtensionType::ScaledUiAmount]));
    }

    #[test]
    fn rejects_extensions_that_let_another_party_move_or_block_vault_tokens() {
        assert!(!extensions_supported(&[ExtensionType::PermanentDelegate]));
        assert!(!extensions_supported(&[ExtensionType::DefaultAccountState]));
        assert!(!extensions_supported(&[ExtensionType::Pausable]));
        assert!(!extensions_supported(&[ExtensionType::MintCloseAuthority]));
    }

    #[test]
    fn rejects_the_confidential_transfer_family() {
        assert!(!extensions_supported(&[ExtensionType::ConfidentialTransferMint]));
        assert!(!extensions_supported(&[ExtensionType::ConfidentialTransferFeeConfig]));
        assert!(!extensions_supported(&[ExtensionType::ConfidentialMintBurn]));
    }

    #[test]
    fn rejects_group_extensions() {
        assert!(!extensions_supported(&[ExtensionType::GroupPointer]));
        assert!(!extensions_supported(&[ExtensionType::TokenGroup]));
        assert!(!extensions_supported(&[ExtensionType::GroupMemberPointer]));
        assert!(!extensions_supported(&[ExtensionType::TokenGroupMember]));
    }

    #[test]
    fn rejects_an_allowed_extension_next_to_a_rejected_one() {
        assert!(!extensions_supported(&[
            ExtensionType::InterestBearingConfig,
            ExtensionType::TransferFeeConfig,
        ]));
    }

    #[test]
    fn reads_a_known_extension_type_from_mint_data() {
        let data = mint_data_with_extension_type(u16::from(ExtensionType::PermanentDelegate));
        assert_eq!(
            token_2022_mint_extensions(&data),
            Some(vec![ExtensionType::PermanentDelegate])
        );
    }

    #[test]
    fn reports_no_extension_list_for_a_type_this_build_does_not_know() {
        let data = mint_data_with_extension_type(9_999);
        assert_eq!(token_2022_mint_extensions(&data), None);
    }
}
