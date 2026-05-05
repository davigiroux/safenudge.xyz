use anchor_lang::prelude::*;

#[error_code]
pub enum SafeNudgeError {
    #[msg("Group is not in the correct status for this action")]
    InvalidGroupStatus,
    #[msg("Group is full")]
    GroupFull,
    #[msg("Only the group creator can perform this action")]
    UnauthorizedCreator,
    #[msg("Group needs at least 2 members to start")]
    InsufficientMembers,
    #[msg("Cycle has not ended yet")]
    CycleNotEnded,
    #[msg("Already deposited for this period")]
    AlreadyDeposited,
    #[msg("Cycle has ended, no more deposits accepted")]
    CycleEnded,
    #[msg("Invalid group code format")]
    InvalidGroupCode,
    #[msg("Invalid penalty configuration")]
    InvalidPenaltyConfig,
    #[msg("Invalid frequency value")]
    InvalidFrequency,
    #[msg("Invalid group size")]
    InvalidGroupSize,
    #[msg("Invalid period count")]
    InvalidPeriodCount,
    #[msg("Deposit amount must be greater than zero")]
    InvalidDepositAmount,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Token mint does not match group configuration")]
    InvalidMint,
    #[msg("Member count mismatch in distribution")]
    MemberCountMismatch,
    #[msg("Account is not owned by this program")]
    InvalidAccountOwner,
    #[msg("Member record does not match the canonical PDA for its member")]
    InvalidMemberRecord,
    #[msg("Destination token account does not belong to the expected member")]
    InvalidTokenAccountOwner,
    #[msg("The same member record was passed more than once")]
    DuplicateMemberRecord,
    #[msg("Recipient is not the configured FEE_RECIPIENT")]
    UnauthorizedRecipient,
}
