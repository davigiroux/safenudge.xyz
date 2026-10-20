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
    #[msg("Treasury has no fees to withdraw")]
    NoFeesToWithdraw,
    #[msg("Protocol treasury token account for this mint has not been initialized")]
    TreasuryNotInitialized,
    #[msg("Rent refund destination does not match the recorded rent payer")]
    InvalidRentPayer,
    #[msg("Member records stay open for the retention period after settlement")]
    RecordRetentionNotElapsed,
    #[msg("This mint cannot be used for a group")]
    UnsupportedMint,
    #[msg("Mint must be writable to cancel a group with no members whose vault holds tokens")]
    MintNotWritable,
    #[msg("Close every member record before closing the group")]
    GroupHasOpenRecords,
    #[msg("The join authority can only be set before anyone joins")]
    GroupHasMembers,
    #[msg("The join authority cannot be the default public key or the program ID")]
    InvalidJoinAuthority,
    #[msg("This group needs its join authority to approve the join")]
    JoinNotApproved,
    #[msg("A gated join cannot use a durable nonce")]
    DurableNonceNotAllowed,
    #[msg("Close the group before closing a join tally")]
    GroupNotClosed,
    #[msg("The member's join count no longer matches the approved join")]
    JoinCountMismatch,
    #[msg("A gated join must name the member's expected join count")]
    ExpectedJoinsRequired,
    #[msg("The group's terms changed since the join was signed")]
    TermsMismatch,
    #[msg("Settlement payouts do not add up to the deposits")]
    SettlementImbalance,
    #[msg("The vault holds less than the members deposited")]
    VaultShortfall,
}
